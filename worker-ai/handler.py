"""RunPod Serverless handler: one photo in, a textured .glb out (TRELLIS.2, MIT licence).

Input:  {"image": "<base64 JPEG or PNG>", "seed": <int, optional>}
Output: {"glb": "<base64>"}, or {"error": "<code>"} which RunPod reports as a failed job.

The rest of this file follows the model's own README and app.py, but has not been run on a real
GPU yet: see README.md.
"""
import base64
import io
import os
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
TEXTURE_SIZE = int(os.environ.get("TEXTURE_SIZE", "1024"))


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
        mesh.simplify(16777216)  # nvdiffrast limit
        model = o_voxel.postprocess.to_glb(
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
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "model.glb")
            model.export(path)
            with open(path, "rb") as f:
                return {"glb": base64.b64encode(f.read()).decode("ascii")}
    finally:
        torch.cuda.empty_cache()


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
