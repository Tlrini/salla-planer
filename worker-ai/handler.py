"""RunPod Serverless handler: one photo in, a textured .glb out (TRELLIS.2, MIT licence).

Input:  {"image": "<base64 JPEG or PNG>", "seed": <int, optional>}
Output: {"glb": "<base64>"}, or {"error": "<code>"} which RunPod reports as a failed job.

The rest of this file follows the model's own README and app.py, but has not been run on a real
GPU yet: see README.md.
"""
import base64
import gc
import io
import json
import os
import struct
import tempfile

os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import o_voxel  # noqa: E402
import runpod  # noqa: E402
import torch  # noqa: E402
from PIL import Image, ImageOps  # noqa: E402
from trellis2.pipelines import Trellis2ImageTo3DPipeline, rembg  # noqa: E402

MODEL = os.environ.get("TRELLIS_MODEL", "microsoft/TRELLIS.2-4B")
# '512' is several times faster and coarser; the comparison on the real GPU decides.
PIPELINE_TYPE = os.environ.get("PIPELINE_TYPE", "1024_cascade")
TARGET_FACES = int(os.environ.get("TARGET_FACES", "150000"))
# The model's example keeps up to 16.7 M faces (nvdiffrast's limit) before the GLB step, sized for
# 80 GB GPUs; on 24 GB the GLB simplification then ran out of memory (2026-11-18). A first cut to
# 1 M faces keeps the detail the final 150 k faces can show.
PRE_SIMPLIFY_FACES = int(os.environ.get("PRE_SIMPLIFY_FACES", "1000000"))
# RunPod silently drops a job's output when it is too large (a 2048 px PNG-textured model came back
# as COMPLETED with no output, 2026-11-18). The base64 GLB is kept under this many characters.
MAX_OUTPUT_CHARS = int(os.environ.get("MAX_OUTPUT_CHARS", "8000000"))
JPEG_QUALITY = int(os.environ.get("JPEG_QUALITY", "90"))
# The app keeps textures at 2048 px at most (tablets), so a larger texture would only cost time.
TEXTURE_SIZE = int(os.environ.get("TEXTURE_SIZE", "2048"))


class MitBackgroundRemover(rembg.BiRefNet):
    """The model's default background remover (RMBG-2.0) is non-commercial; this one is MIT."""

    def __init__(self, model_name=None):
        super().__init__("ZhengPeng7/BiRefNet")


rembg.BiRefNet = MitBackgroundRemover

# Loaded once per worker: this is the "cold start", later jobs skip it.
pipeline = Trellis2ImageTo3DPipeline.from_pretrained(MODEL)
pipeline.cuda()


def read_photo(data):
    """The photo the right way up, or None when it cannot be read."""
    try:
        image = Image.open(io.BytesIO(base64.b64decode(data)))
        image.load()
        return ImageOps.exif_transpose(image)
    except Exception:
        return None


def free_gpu():
    gc.collect()
    torch.cuda.empty_cache()


def export_glb(mesh):
    return o_voxel.postprocess.to_glb(
        vertices=mesh.vertices,
        faces=mesh.faces,
        attr_volume=mesh.attrs,
        coords=mesh.coords,
        attr_layout=mesh.layout,
        voxel_size=mesh.voxel_size,
        aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
        decimation_target=TARGET_FACES,
        texture_size=TEXTURE_SIZE,
        remesh=True,
        remesh_band=1,
        remesh_project=0,
    )


def _pad4(data, fill=b"\0"):
    return data + fill * (-len(data) % 4)


def shrink_glb(glb, max_side=None):
    """The GLB with every texture re-encoded as JPEG (the export is opaque, so alpha is dropped),
    scaled to at most max_side pixels. Other buffer data is copied unchanged."""
    magic, _version, _length = struct.unpack_from("<4sII", glb, 0)
    if magic != b"glTF":
        raise ValueError("not a GLB")
    json_len, json_type = struct.unpack_from("<I4s", glb, 12)
    doc = json.loads(glb[20:20 + json_len])
    binary = b""
    offset = 20 + json_len
    if offset < len(glb):
        bin_len, _bin_type = struct.unpack_from("<I4s", glb, offset)
        binary = glb[offset + 8:offset + 8 + bin_len]

    views = doc.get("bufferViews", [])
    image_views = {}
    for image in doc.get("images", []):
        if "bufferView" not in image:
            continue
        view = views[image["bufferView"]]
        start = view.get("byteOffset", 0)
        picture = Image.open(io.BytesIO(binary[start:start + view["byteLength"]])).convert("RGB")
        if max_side and max(picture.size) > max_side:
            picture.thumbnail((max_side, max_side), Image.LANCZOS)
        out = io.BytesIO()
        picture.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True)
        image_views[image["bufferView"]] = out.getvalue()
        image["mimeType"] = "image/jpeg"

    new_binary = b""
    for i, view in enumerate(views):
        start = view.get("byteOffset", 0)
        data = image_views.get(i, binary[start:start + view["byteLength"]])
        new_binary = _pad4(new_binary)
        view["byteOffset"] = len(new_binary)
        view["byteLength"] = len(data)
        view["buffer"] = 0
        new_binary += data
    new_binary = _pad4(new_binary)
    if doc.get("buffers"):
        doc["buffers"] = [{"byteLength": len(new_binary)}]

    json_chunk = _pad4(json.dumps(doc, separators=(",", ":")).encode(), b" ")
    chunks = struct.pack("<I4s", len(json_chunk), b"JSON") + json_chunk
    if new_binary:
        chunks += struct.pack("<I4s", len(new_binary), b"BIN\0") + new_binary
    return struct.pack("<4sII", b"glTF", 2, 12 + len(chunks)) + chunks


def small_enough_glb(glb):
    """Base64 of the GLB with JPEG textures, halving them until it fits MAX_OUTPUT_CHARS."""
    side = None
    while True:
        encoded = base64.b64encode(shrink_glb(glb, side)).decode("ascii")
        if len(encoded) <= MAX_OUTPUT_CHARS or (side or TEXTURE_SIZE) <= 256:
            print(f"model: {len(glb)} bytes exported, {len(encoded)} base64 chars sent "
                  f"(textures {side or 'full size'})", flush=True)
            return encoded
        side = (side or TEXTURE_SIZE) // 2


def handler(job):
    job_input = job.get("input", {})
    data = job_input.get("image")
    if not data:
        return {"error": "no_image"}
    photo = read_photo(data)
    if photo is None:
        return {"error": "bad_image"}

    try:
        # Fails when the background remover finds nothing to keep.
        subject = pipeline.preprocess_image(photo)
    except ValueError:
        return {"error": "no_object"}

    try:
        mesh = pipeline.run(
            subject,
            seed=int(job_input.get("seed", 42)),
            preprocess_image=False,
            pipeline_type=PIPELINE_TYPE,
        )[0]
        free_gpu()
        mesh.simplify(PRE_SIMPLIFY_FACES)
        free_gpu()
        try:
            model = export_glb(mesh)
        except RuntimeError as err:
            if "out of memory" not in str(err):
                raise
            # Still too big: move the model weights off the GPU for the export, then back.
            pipeline.cpu()
            free_gpu()
            try:
                model = export_glb(mesh)
            finally:
                pipeline.cuda()
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "model.glb")
            model.export(path)
            with open(path, "rb") as f:
                return {"glb": small_enough_glb(f.read())}
    finally:
        torch.cuda.empty_cache()


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
