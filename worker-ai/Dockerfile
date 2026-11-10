# GPU image for AI scans (RunPod Serverless). Not built yet, see README.md. It installs the same
# packages as TRELLIS.2's setup.sh, written out here because that script refuses to run without
# a GPU, which a Docker build does not have. Model weights download once to the network volume.
FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel

ENV HF_HOME=/runpod-volume/huggingface

RUN apt-get update \
  && apt-get install -y --no-install-recommends git libjpeg-dev zlib1g-dev libgl1 libglib2.0-0 \
  && git clone --recursive https://github.com/microsoft/TRELLIS.2.git /app \
  && git -C /app checkout 75fbf0183001ed9876c8dbb35de6b68552ee08bd \
  && git -C /app submodule update --init --recursive

RUN pip install imageio imageio-ffmpeg tqdm easydict opencv-python-headless ninja trimesh \
    transformers tensorboard pandas lpips zstandard kornia timm pillow-simd flash-attn==2.7.3 \
    runpod==2.2.0 \
    git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8

RUN mkdir -p /tmp/extensions && cd /tmp/extensions \
  && git clone -b v0.4.0 https://github.com/NVlabs/nvdiffrast.git \
  && git clone -b renderutils https://github.com/JeffreyXiang/nvdiffrec.git \
  && git clone --recursive https://github.com/JeffreyXiang/CuMesh.git \
  && git clone --recursive https://github.com/JeffreyXiang/FlexGEMM.git \
  && cp -r /app/o-voxel o-voxel \
  && for p in nvdiffrast nvdiffrec CuMesh FlexGEMM o-voxel; do \
       pip install "/tmp/extensions/$p" --no-build-isolation || exit 1; \
     done \
  && rm -rf /tmp/extensions

COPY handler.py /app/handler.py
WORKDIR /app
CMD ["python", "-u", "handler.py"]
