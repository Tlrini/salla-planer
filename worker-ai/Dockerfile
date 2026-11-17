# GPU image for AI scans (RunPod Serverless), built by .github/workflows/worker-ai-image.yml and
# published to ghcr.io. It installs the same packages as TRELLIS.2's setup.sh, written out here
# because that script refuses to run without a GPU, which a Docker build does not have.
# Model weights are not in the image: they download from Hugging Face on a worker's first job
# (HF_TOKEN with access to facebook/dinov3-vitl16-pretrain-lvd1689m, see README.md).
FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel

# No GPU during the build: compile the CUDA extensions for the GPUs RunPod rents with 24 GB+
# (A5000/A6000/3090/A40 = 8.6, 4090/L4/L40S = 8.9, H100 = 9.0).
ENV TORCH_CUDA_ARCH_LIST="8.6;8.9;9.0" \
    MAX_JOBS=4 \
    HF_HOME=/models/huggingface \
    PYTHONUNBUFFERED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends git libjpeg-dev zlib1g-dev libgl1 libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/* \
  && git clone --recursive https://github.com/microsoft/TRELLIS.2.git /app \
  && git -C /app checkout 75fbf0183001ed9876c8dbb35de6b68552ee08bd \
  && git -C /app submodule update --init --recursive

RUN pip install --no-cache-dir imageio imageio-ffmpeg tqdm easydict opencv-python-headless ninja \
    trimesh transformers tensorboard pandas lpips zstandard kornia timm pillow-simd runpod==2.2.0 \
    git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8

# 2.7.4.post1 is the first flash-attn release with a prebuilt wheel for PyTorch 2.6; an older pin
# would compile from source for hours.
RUN pip install --no-cache-dir --no-build-isolation flash-attn==2.7.4.post1

RUN mkdir -p /tmp/extensions && cd /tmp/extensions \
  && git clone -b v0.4.0 https://github.com/NVlabs/nvdiffrast.git \
  && git clone -b renderutils https://github.com/JeffreyXiang/nvdiffrec.git \
  && git clone --recursive https://github.com/JeffreyXiang/CuMesh.git \
  && git clone --recursive https://github.com/JeffreyXiang/FlexGEMM.git \
  && cp -r /app/o-voxel o-voxel \
  && for p in nvdiffrast nvdiffrec CuMesh FlexGEMM o-voxel; do \
       pip install --no-cache-dir "/tmp/extensions/$p" --no-build-isolation || exit 1; \
     done \
  && rm -rf /tmp/extensions

COPY handler.py /app/handler.py
WORKDIR /app
CMD ["python", "-u", "handler.py"]
