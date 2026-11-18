"""Checks handler.py without a GPU: the model libraries are replaced by stand-ins.

Run with: python worker-ai/test_handler.py (needs only Pillow).
"""
import base64
import importlib
import io
import os
import sys
import types
import unittest
from unittest import mock

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))


class FakeRemover:
    def __init__(self, model_name="default"):
        self.model_name = model_name


class FakeMesh:
    vertices = faces = attrs = coords = layout = voxel_size = None

    def simplify(self, limit):
        self.limit = limit


class FakePipeline:
    instance = None
    fail_preprocess = False

    @classmethod
    def from_pretrained(cls, name):
        cls.instance = cls()
        cls.instance.name = name
        # The real from_pretrained builds the remover from the model's config.
        cls.instance.remover = rembg_module.BiRefNet("briaai/RMBG-2.0")
        return cls.instance

    def cuda(self):
        self.on_gpu = True
        return self

    def cpu(self):
        self.on_gpu = False
        self.moved_to_cpu = getattr(self, "moved_to_cpu", 0) + 1
        return self

    def preprocess_image(self, image):
        if FakePipeline.fail_preprocess:
            raise ValueError("zero-size array")
        self.seen = image
        return image

    def run(self, image, **kwargs):
        self.run_args = kwargs
        self.mesh = FakeMesh()
        return [self.mesh]


def make_glb(texture_side=64):
    """A real minimal GLB: one PNG texture (noise, so it does not compress away) + 36 bytes of
    vertex data in another buffer view."""
    import json
    import random
    import struct

    random.seed(1)
    picture = Image.frombytes(
        "RGBA", (texture_side, texture_side),
        bytes(random.randrange(256) for _ in range(texture_side * texture_side * 4)),
    )
    png = io.BytesIO()
    picture.save(png, "PNG")
    png = png.getvalue()
    vertices = bytes(range(36))
    pad = lambda b, f=b"\0": b + f * (-len(b) % 4)  # noqa: E731
    binary = pad(vertices) + png
    doc = {
        "asset": {"version": "2.0"},
        "buffers": [{"byteLength": len(pad(binary))}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(vertices)},
            {"buffer": 0, "byteOffset": len(pad(vertices)), "byteLength": len(png)},
        ],
        "images": [{"bufferView": 1, "mimeType": "image/png"}],
    }
    js = pad(json.dumps(doc).encode(), b" ")
    binary = pad(binary)
    chunks = struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(binary), b"BIN\0") + binary
    return struct.pack("<4sII", b"glTF", 2, 12 + len(chunks)) + chunks


def read_glb(glb):
    import json
    import struct

    json_len = struct.unpack_from("<I", glb, 12)[0]
    doc = json.loads(glb[20:20 + json_len])
    bin_len = struct.unpack_from("<I", glb, 20 + json_len)[0]
    binary = glb[28 + json_len:28 + json_len + bin_len]
    assert struct.unpack_from("<I", glb, 8)[0] == len(glb)
    return doc, binary


class FakeGlb:
    def export(self, path):
        with open(path, "wb") as f:
            f.write(make_glb())


rembg_module = types.SimpleNamespace(BiRefNet=FakeRemover)
to_glb = mock.MagicMock(return_value=FakeGlb())
sys.modules.update(
    {
        "o_voxel": types.SimpleNamespace(postprocess=types.SimpleNamespace(to_glb=to_glb)),
        "runpod": types.SimpleNamespace(
            serverless=types.SimpleNamespace(start=mock.MagicMock())
        ),
        "torch": types.SimpleNamespace(cuda=types.SimpleNamespace(empty_cache=mock.MagicMock())),
        "trellis2": types.ModuleType("trellis2"),
        "trellis2.pipelines": types.SimpleNamespace(
            Trellis2ImageTo3DPipeline=FakePipeline, rembg=rembg_module
        ),
    }
)
handler = importlib.import_module("handler")


def photo(orientation=None):
    image = Image.new("RGB", (40, 20), "white")
    exif = Image.Exif()
    if orientation:
        exif[0x0112] = orientation
    buf = io.BytesIO()
    image.save(buf, "JPEG", exif=exif)
    return base64.b64encode(buf.getvalue()).decode("ascii")


class HandlerTest(unittest.TestCase):
    def setUp(self):
        FakePipeline.fail_preprocess = False
        to_glb.reset_mock()
        to_glb.side_effect = None
        to_glb.return_value = FakeGlb()

    def test_cuts_the_mesh_down_before_the_glb_step(self):
        handler.handler({"input": {"image": photo()}})
        self.assertEqual(FakePipeline.instance.mesh.limit, 1_000_000)

    def test_retries_the_glb_step_without_the_weights_on_the_gpu(self):
        FakePipeline.instance.moved_to_cpu = 0
        to_glb.side_effect = [RuntimeError("[CuMesh] CUDA error: out of memory"), FakeGlb()]
        out = handler.handler({"input": {"image": photo()}})
        self.assertEqual(base64.b64decode(out["glb"])[:4], b"glTF")
        self.assertEqual(FakePipeline.instance.moved_to_cpu, 1)
        self.assertTrue(FakePipeline.instance.on_gpu)

    def test_other_glb_errors_are_not_retried(self):
        to_glb.side_effect = RuntimeError("something else")
        with self.assertRaises(RuntimeError):
            handler.handler({"input": {"image": photo()}})
        self.assertEqual(to_glb.call_count, 1)

    def test_returns_the_model(self):
        out = handler.handler({"input": {"image": photo()}})
        doc, _ = read_glb(base64.b64decode(out["glb"]))
        self.assertEqual(doc["images"][0]["mimeType"], "image/jpeg")

    def test_textures_become_jpeg_and_other_data_is_kept(self):
        doc, binary = read_glb(handler.shrink_glb(make_glb()))
        img = doc["bufferViews"][1]
        self.assertEqual(binary[img["byteOffset"]:img["byteOffset"] + 2], b"\xff\xd8")
        self.assertEqual(Image.open(io.BytesIO(binary[img["byteOffset"]:img["byteOffset"] + img["byteLength"]])).size, (64, 64))
        vtx = doc["bufferViews"][0]
        self.assertEqual(binary[vtx["byteOffset"]:vtx["byteOffset"] + vtx["byteLength"]], bytes(range(36)))
        self.assertEqual(doc["buffers"][0]["byteLength"], len(binary))
        self.assertEqual(img["byteOffset"] % 4, 0)

    def test_textures_shrink_until_the_output_fits(self):
        big = make_glb(512)
        with mock.patch.object(handler, "MAX_OUTPUT_CHARS", 60_000):
            encoded = handler.small_enough_glb(big)
        self.assertLessEqual(len(encoded), 60_000)
        doc, binary = read_glb(base64.b64decode(encoded))
        img = doc["bufferViews"][1]
        side = Image.open(io.BytesIO(binary[img["byteOffset"]:img["byteOffset"] + img["byteLength"]])).size[0]
        self.assertLess(side, 512)

    def test_uses_the_settings(self):
        handler.handler({"input": {"image": photo(), "seed": 7}})
        args = FakePipeline.instance.run_args
        self.assertEqual(
            args, {"seed": 7, "preprocess_image": False, "pipeline_type": "1024_cascade"}
        )
        self.assertEqual(to_glb.call_args.kwargs["decimation_target"], 150000)
        self.assertEqual(to_glb.call_args.kwargs["texture_size"], 2048)

    def test_never_uses_the_non_commercial_background_remover(self):
        self.assertEqual(FakePipeline.instance.remover.model_name, "ZhengPeng7/BiRefNet")

    def test_turns_a_sideways_phone_photo_upright(self):
        handler.handler({"input": {"image": photo(orientation=6)}})
        self.assertEqual(FakePipeline.instance.seen.size, (20, 40))

    def test_explains_bad_input(self):
        self.assertEqual(handler.handler({"input": {}}), {"error": "no_image"})
        self.assertEqual(handler.handler({"input": {"image": "AAAA"}}), {"error": "bad_image"})

    def test_explains_a_photo_without_an_object(self):
        FakePipeline.fail_preprocess = True
        self.assertEqual(handler.handler({"input": {"image": photo()}}), {"error": "no_object"})


if __name__ == "__main__":
    unittest.main()
