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
        return self

    def preprocess_image(self, image):
        if FakePipeline.fail_preprocess:
            raise ValueError("zero-size array")
        self.seen = image
        return image

    def run(self, image, **kwargs):
        self.run_args = kwargs
        return [FakeMesh()]


class FakeGlb:
    def export(self, path):
        with open(path, "wb") as f:
            f.write(b"glTF-model")


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

    def test_returns_the_model(self):
        out = handler.handler({"input": {"image": photo()}})
        self.assertEqual(base64.b64decode(out["glb"]), b"glTF-model")

    def test_uses_the_settings(self):
        handler.handler({"input": {"image": photo(), "seed": 7}})
        args = FakePipeline.instance.run_args
        self.assertEqual(
            args, {"seed": 7, "preprocess_image": False, "pipeline_type": "1024_cascade"}
        )
        self.assertEqual(to_glb.call_args.kwargs["decimation_target"], 150000)
        self.assertEqual(to_glb.call_args.kwargs["texture_size"], 1024)

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
