# AI scan worker

Turns one photo into a textured `.glb` with [TRELLIS.2](https://github.com/microsoft/TRELLIS.2)
(MIT) on RunPod Serverless. The GPU is billed per second and costs nothing while idle. The app
server calls it (`server/src/aiScan.ts`); nothing has to reach the app from outside.

**Status: written but never run.** The handler and the Dockerfile follow the model's README and
will probably need adjusting on the first build.

## What it needs

1. A **RunPod** account with some credit, and an API key.
2. A **Hugging Face** account and token, with access granted to the gated model
   `facebook/dinov3-vitl16-pretrain-lvd1689m`, which TRELLIS.2 uses. Read its licence before
   using this commercially. The default background remover (RMBG-2.0, non-commercial) is replaced
   in `handler.py` by BiRefNet (MIT).

## Set-up

1. Create a RunPod **network volume** (about 30 GB) for the model weights.
2. Create a **Serverless endpoint** from this folder (build from the GitHub repository, Dockerfile
   `worker-ai/Dockerfile`, context `worker-ai`):
   - GPU with **at least 24 GB** of memory;
   - attach the network volume; **max workers** 1; **idle timeout** 5 seconds;
   - environment variable `HF_TOKEN` with the Hugging Face token.
3. On the app server, set `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` (see `.env.example`).

The first job downloads the weights and takes much longer than later ones.

## Measure on the first runs

- Time: photo sent → model ready, on a cold and on a warm worker. The app assumes about 2 minutes
  (`AI_EXPECTED_MINUTES` in `shared/src/scans.ts`).
- Size of the returned `.glb`: RunPod does not document a limit for job output. If a job fails
  because of size, lower `TEXTURE_SIZE` or `TARGET_FACES`.
- Cost per job, in the RunPod billing page.
