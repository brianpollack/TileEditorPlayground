"use client";

import { faCamera, faTrashCan } from "@awesome.me/kit-a62459359b/icons/classic/solid";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { ConfirmationDialog } from "./ConfirmationDialog";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { emptyStateCardClass } from "./uiStyles";

type PreviewStatus = "loading" | "ready" | "fallback";
const SAVE_ITEM_IMAGE_PATH = "/__items/save-image";

interface ViewMetrics {
  azimuthDegrees: number;
  cameraPosition: THREE.Vector3Tuple;
  distance: number;
  polarDegrees: number;
}

interface ItemModelPreviewProps {
  assetVersion?: number;
  currentImageUrl?: string;
  fallback?: ReactNode;
  itemId: number;
  itemName: string;
  modelPath: string | null;
  onCaptureSaved?: () => void;
  onModelLoadedChange?: (isLoaded: boolean) => void;
  onRequestReplaceModel?: () => void;
  texturePaths: string[];
  vaxServer: string;
}

interface FitViewOptions {
  azimuthRadians?: number;
  fovDegrees?: number;
  polarRadians?: number;
}

interface FitBoundsState {
  box: THREE.Box3;
  sphere: THREE.Sphere;
}

function resolveVaxAssetUrl(value: string, vaxServer: string) {
  if (!value) {
    return "";
  }

  if (value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  const normalizedPath = value.startsWith("/") ? value : `/${value}`;
  return `${vaxServer}${normalizedPath}`;
}

function appendAssetVersion(url: string, assetVersion: number) {
  if (!assetVersion) {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}v=${assetVersion}`;
}

function buildModelCandidates(itemId: number, modelPath: string | null, vaxServer: string) {
  const fallbackBaseUrl = `${vaxServer}/items/${itemId}/model`;
  const normalizedModelPath = modelPath?.trim() ?? "";
  const urls = new Set<string>();

  if (normalizedModelPath) {
    const resolvedUrl = resolveVaxAssetUrl(normalizedModelPath, vaxServer);

    if (/\.gl(?:b|tf)(?:$|\?)/iu.test(resolvedUrl)) {
      urls.add(resolvedUrl);
    } else if (!/\.[a-z0-9]+(?:$|\?)/iu.test(resolvedUrl)) {
      urls.add(`${resolvedUrl}.glb`);
      urls.add(`${resolvedUrl}.gltf`);
    }
  }

  urls.add(`${fallbackBaseUrl}.glb`);
  urls.add(`${fallbackBaseUrl}.gltf`);

  return Array.from(urls);
}

function buildTextureCandidates(itemId: number, texturePaths: string[], vaxServer: string) {
  const urls = new Set<string>();

  for (const texturePath of texturePaths) {
    const normalizedTexturePath = texturePath.trim();

    if (!normalizedTexturePath) {
      continue;
    }

    urls.add(resolveVaxAssetUrl(normalizedTexturePath, vaxServer));
  }

  urls.add(`${vaxServer}/items/${itemId}/texture.png`);

  return Array.from(urls);
}

function disposeMaterial(material: THREE.Material) {
  const typedMaterial = material as THREE.Material & {
    alphaMap?: THREE.Texture | null;
    aoMap?: THREE.Texture | null;
    bumpMap?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
    map?: THREE.Texture | null;
    metalnessMap?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
  };

  typedMaterial.map?.dispose();
  typedMaterial.alphaMap?.dispose();
  typedMaterial.aoMap?.dispose();
  typedMaterial.bumpMap?.dispose();
  typedMaterial.emissiveMap?.dispose();
  typedMaterial.metalnessMap?.dispose();
  typedMaterial.normalMap?.dispose();
  typedMaterial.roughnessMap?.dispose();
  material.dispose();
}

async function loadTexture(
  textureLoader: THREE.TextureLoader,
  textureCandidates: string[],
  signal: AbortSignal
) {
  for (const textureUrl of textureCandidates) {
    if (signal.aborted) {
      return null;
    }

    try {
      const texture = await textureLoader.loadAsync(textureUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      return texture;
    } catch {
      continue;
    }
  }

  return null;
}

async function loadModel(
  gltfLoader: GLTFLoader,
  modelCandidates: string[],
  signal: AbortSignal
) {
  for (const modelUrl of modelCandidates) {
    if (signal.aborted) {
      return null;
    }

    try {
      const gltf = await gltfLoader.loadAsync(modelUrl);
      return { gltf, modelUrl };
    } catch {
      continue;
    }
  }

  return null;
}

function roundMetric(value: number) {
  return Number(value.toFixed(3));
}

function getViewMetrics(camera: THREE.PerspectiveCamera, controls: OrbitControls): ViewMetrics {
  return {
    azimuthDegrees: roundMetric(THREE.MathUtils.radToDeg(controls.getAzimuthalAngle())),
    cameraPosition: [
      roundMetric(camera.position.x),
      roundMetric(camera.position.y),
      roundMetric(camera.position.z)
    ],
    distance: roundMetric(camera.position.distanceTo(controls.target)),
    polarDegrees: roundMetric(THREE.MathUtils.radToDeg(controls.getPolarAngle()))
  };
}

function createTransparentCanvas(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function drawScaledCanvas(
  source: CanvasImageSource,
  targetCanvas: HTMLCanvasElement,
  targetSize: number
) {
  const context = targetCanvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create a preview image.");
  }

  context.clearRect(0, 0, targetSize, targetSize);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, targetSize, targetSize);
}

function createAntialiasedCapture(sourceCanvas: HTMLCanvasElement) {
  const stagedCanvas = createTransparentCanvas(256);
  drawScaledCanvas(sourceCanvas, stagedCanvas, 256);

  const outputCanvas = createTransparentCanvas(128);
  drawScaledCanvas(stagedCanvas, outputCanvas, 128);

  return outputCanvas.toDataURL("image/png");
}

function getBoxCorners(box: THREE.Box3) {
  const { max, min } = box;

  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z)
  ];
}

function getOrbitBasis(orbitDirection: THREE.Vector3) {
  const zAxis = orbitDirection.clone().normalize();
  const seedUp = Math.abs(zAxis.y) > 0.999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3().crossVectors(seedUp, zAxis).normalize();
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

  return { xAxis, yAxis, zAxis };
}

function getRequiredDistanceToFitBox(
  box: THREE.Box3,
  target: THREE.Vector3,
  orbitDirection: THREE.Vector3,
  camera: THREE.PerspectiveCamera
) {
  const { xAxis, yAxis, zAxis } = getOrbitBasis(orbitDirection);
  const halfVerticalFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * camera.aspect);
  const tanVertical = Math.max(Math.tan(halfVerticalFov), 1e-4);
  const tanHorizontal = Math.max(Math.tan(halfHorizontalFov), 1e-4);
  const corners = getBoxCorners(box);

  let requiredDistance = 0;

  for (const corner of corners) {
    const offset = corner.clone().sub(target);
    const cameraSpaceX = Math.abs(offset.dot(xAxis));
    const cameraSpaceY = Math.abs(offset.dot(yAxis));
    const cameraSpaceZ = offset.dot(zAxis);

    requiredDistance = Math.max(
      requiredDistance,
      cameraSpaceZ + cameraSpaceX / tanHorizontal,
      cameraSpaceZ + cameraSpaceY / tanVertical
    );
  }

  return Math.max(requiredDistance * 1.015, 0.01);
}

function fitCameraToSphere(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  fitBounds: FitBoundsState,
  options: FitViewOptions = {}
) {
  const nextFovDegrees = options.fovDegrees ?? camera.fov;
  const nextPolarRadians = options.polarRadians;
  const nextAzimuthRadians = options.azimuthRadians;

  camera.fov = nextFovDegrees;
  camera.updateProjectionMatrix();

  let orbitDirection: THREE.Vector3;

  if (typeof nextPolarRadians === "number" || typeof nextAzimuthRadians === "number") {
    const spherical = new THREE.Spherical(
      1,
      nextPolarRadians ?? Math.PI / 2,
      nextAzimuthRadians ?? 0
    );
    orbitDirection = new THREE.Vector3().setFromSpherical(spherical).normalize();
  } else {
    orbitDirection = new THREE.Vector3().subVectors(camera.position, controls.target);

    if (orbitDirection.lengthSq() < 1e-6) {
      orbitDirection.set(1, 0.75, 1);
    }

    orbitDirection.normalize();
  }

  const fitDistance = getRequiredDistanceToFitBox(fitBounds.box, fitBounds.sphere.center, orbitDirection, camera);

  controls.target.copy(fitBounds.sphere.center);
  camera.position.copy(fitBounds.sphere.center).addScaledVector(orbitDirection, fitDistance);
  camera.near = Math.max(fitDistance / 100, 0.01);
  camera.far = Math.max(fitDistance + fitBounds.sphere.radius * 10, 10);
  camera.lookAt(fitBounds.sphere.center);
  camera.updateProjectionMatrix();
  controls.minDistance = Math.max(fitBounds.sphere.radius * 0.65, 0.25);
  controls.maxDistance = Math.max(fitDistance * 5, fitBounds.sphere.radius * 10, 2);
  controls.update();
}

export function ItemModelPreview({
  assetVersion = 0,
  currentImageUrl = "",
  fallback = null,
  itemId,
  itemName,
  modelPath,
  onCaptureSaved,
  onModelLoadedChange,
  onRequestReplaceModel,
  texturePaths,
  vaxServer
}: ItemModelPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const fitBoundsRef = useRef<FitBoundsState | null>(null);
  const [status, setStatus] = useState<PreviewStatus>("loading");
  const [captureError, setCaptureError] = useState("");
  const [captureImageUrl, setCaptureImageUrl] = useState("");
  const [isCaptureConfirmationOpen, setCaptureConfirmationOpen] = useState(false);
  const [isSavingCapture, setSavingCapture] = useState(false);
  const [viewMetrics, setViewMetrics] = useState<ViewMetrics | null>(null);

  const modelCandidates = useMemo(
    () => buildModelCandidates(itemId, modelPath, vaxServer).map((url) => appendAssetVersion(url, assetVersion)),
    [assetVersion, itemId, modelPath, vaxServer]
  );
  const textureCandidates = useMemo(
    () => buildTextureCandidates(itemId, texturePaths, vaxServer).map((url) => appendAssetVersion(url, assetVersion)),
    [assetVersion, itemId, texturePaths, vaxServer]
  );

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    onModelLoadedChange?.(status === "ready");
  }, [onModelLoadedChange, status]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;

    if (!container || !canvas || !vaxServer || !modelCandidates.length) {
      setStatus("fallback");
      return;
    }

    const abortController = new AbortController();
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      preserveDrawingBuffer: true
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const environmentTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.05).texture;
    scene.environment = environmentTexture;
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
    const controls = new OrbitControls(camera, canvas);
    cameraRef.current = camera;
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 0.5;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.45);
    const hemisphereLight = new THREE.HemisphereLight(0xf8fbff, 0xc9d7d0, 1.1);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    const fillLight = new THREE.DirectionalLight(0xdde8ff, 0.85);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(6, 8, 10);
    fillLight.position.set(-6, 4, 8);
    rimLight.position.set(-4, 7, -10);
    scene.add(ambientLight, hemisphereLight, keyLight, fillLight, rimLight);

    const gltfLoader = new GLTFLoader();
    gltfLoader.setCrossOrigin("anonymous");

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("anonymous");

    let animationFrameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let modelRoot: THREE.Object3D | null = null;

    const updateRendererSize = () => {
      const nextWidth = Math.max(container.clientWidth, 1);
      const nextHeight = Math.max(container.clientHeight, 1);

      renderer.setSize(nextWidth, nextHeight, false);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      syncViewMetrics();
    };

    const syncViewMetrics = () => {
      setViewMetrics(getViewMetrics(camera, controls));
    };

    const renderFrame = () => {
      animationFrameId = window.requestAnimationFrame(renderFrame);
      controls.update();
      renderer.render(scene, camera);
    };

    setStatus("loading");
    updateRendererSize();
    syncViewMetrics();
    resizeObserver = new ResizeObserver(updateRendererSize);
    resizeObserver.observe(container);
    controls.addEventListener("change", syncViewMetrics);

    void (async () => {
      const loadedModel = await loadModel(gltfLoader, modelCandidates, abortController.signal);

      if (abortController.signal.aborted) {
        return;
      }

      if (!loadedModel) {
        setStatus("fallback");
        return;
      }

      modelRoot = loadedModel.gltf.scene;

      const texture = await loadTexture(textureLoader, textureCandidates, abortController.signal);

      if (abortController.signal.aborted) {
        texture?.dispose();
        return;
      }

      let externalTextureApplied = false;

      modelRoot.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) {
          return;
        }

        node.castShadow = false;
        node.receiveShadow = false;

        const materials = Array.isArray(node.material) ? node.material : [node.material];

        for (const material of materials) {
          const typedMaterial = material as THREE.Material & {
            map?: THREE.Texture | null;
            needsUpdate?: boolean;
          };

          if (texture && !typedMaterial.map && "map" in typedMaterial) {
            typedMaterial.map = texture;
            typedMaterial.needsUpdate = true;
            externalTextureApplied = true;
          }
        }
      });

      if (texture && !externalTextureApplied) {
        texture.dispose();
      }

      const bounds = new THREE.Box3().setFromObject(modelRoot);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z, 0.25);

      modelRoot.position.sub(center);
      scene.add(modelRoot);

      const fitBounds = new THREE.Box3().setFromObject(modelRoot);
      const fitSphere = fitBounds.getBoundingSphere(new THREE.Sphere());
      fitBoundsRef.current = {
        box: fitBounds.clone(),
        sphere: fitSphere.clone()
      };

      camera.position.set(maxDimension * 1.6, maxDimension * 1.2, maxDimension * 1.6);
      fitCameraToSphere(camera, controls, fitBoundsRef.current);
      syncViewMetrics();

      setStatus("ready");
      renderFrame();
    })();

    return () => {
      abortController.abort();
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(animationFrameId);
      controls.removeEventListener("change", syncViewMetrics);
      controls.dispose();
      fitBoundsRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      scene.environment = null;

      if (modelRoot) {
        modelRoot.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) {
            return;
          }

          node.geometry.dispose();

          if (Array.isArray(node.material)) {
            node.material.forEach(disposeMaterial);
            return;
          }

          disposeMaterial(node.material);
        });
      }

      environmentTexture.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
    };
  }, [itemId, itemName, modelCandidates, textureCandidates, vaxServer]);

  if (status === "fallback") {
    return <>{fallback}</>;
  }

  function handleFit() {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const fitBounds = fitBoundsRef.current;

    if (!camera || !controls || !fitBounds) {
      return;
    }

    fitCameraToSphere(camera, controls, fitBounds);
    setViewMetrics(getViewMetrics(camera, controls));
  }

  function handleFront() {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const fitBounds = fitBoundsRef.current;

    if (!camera || !controls || !fitBounds) {
      return;
    }

    fitCameraToSphere(camera, controls, fitBounds, {
      azimuthRadians: 3.657,
      fovDegrees: 35,
      polarRadians: Math.PI / 2
    });
    setViewMetrics(getViewMetrics(camera, controls));
  }

  function handleBack() {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const fitBounds = fitBoundsRef.current;

    if (!camera || !controls || !fitBounds) {
      return;
    }

    fitCameraToSphere(camera, controls, fitBounds, {
      azimuthRadians: 3.657 + Math.PI,
      fovDegrees: 35,
      polarRadians: Math.PI / 2
    });
    setViewMetrics(getViewMetrics(camera, controls));
  }

  function handleCapturePreview() {
    const sourceCanvas = canvasRef.current;

    if (!sourceCanvas || status !== "ready") {
      return;
    }

    try {
      setCaptureError("");
      setCaptureImageUrl(createAntialiasedCapture(sourceCanvas));
      setCaptureConfirmationOpen(true);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Could not create a preview image.");
      setCaptureConfirmationOpen(true);
    }
  }

  function handleCloseCaptureConfirmation() {
    if (isSavingCapture) {
      return;
    }

    setCaptureConfirmationOpen(false);
    setCaptureError("");
    setCaptureImageUrl("");
  }

  function handleConfirmCaptureReplacement() {
    if (!captureImageUrl || isSavingCapture) {
      return;
    }

    setSavingCapture(true);
    setCaptureError("");

    void (async () => {
      try {
        const response = await fetch(SAVE_ITEM_IMAGE_PATH, {
          body: JSON.stringify({
            id: itemId,
            imageDataUrl: captureImageUrl
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<{ error: string }>;

        if (!response.ok || responseBody.error) {
          setCaptureError(responseBody.error ?? "Could not replace item image.");
          return;
        }

        onCaptureSaved?.();
        setCaptureConfirmationOpen(false);
        setCaptureImageUrl("");
      } catch (error) {
        setCaptureError(error instanceof Error ? error.message : "Could not replace item image.");
      } finally {
        setSavingCapture(false);
      }
    })();
  }

  return (
    <div>
      <div
        className={`grid aspect-square w-full overflow-hidden theme-bg-canvas ${
          status === "loading" ? emptyStateCardClass : ""
        }`}
        ref={containerRef}
      >
        {status === "loading" ? (
          <div className="px-4 text-center text-sm theme-text-muted">Loading 3D preview for {itemName}...</div>
        ) : null}
        <canvas
          aria-label={`${itemName} 3D preview`}
          className={`h-full w-full ${status === "ready" ? "block" : "hidden"}`}
          ref={canvasRef}
        />
      </div>
      <div className="mt-1 flex items-center gap-3">
        <button
          className="p-0 text-[11px] leading-none theme-text-muted underline underline-offset-2 transition hover:theme-text-primary disabled:cursor-not-allowed disabled:no-underline disabled:opacity-45"
          disabled={status !== "ready"}
          onClick={handleFront}
          type="button"
        >
          Front
        </button>
        <button
          className="p-0 text-[11px] leading-none theme-text-muted underline underline-offset-2 transition hover:theme-text-primary disabled:cursor-not-allowed disabled:no-underline disabled:opacity-45"
          disabled={status !== "ready"}
          onClick={handleBack}
          type="button"
        >
          Back
        </button>
        <button
          className="p-0 text-[11px] leading-none theme-text-muted underline underline-offset-2 transition hover:theme-text-primary disabled:cursor-not-allowed disabled:no-underline disabled:opacity-45"
          disabled={status !== "ready"}
          onClick={handleFit}
          type="button"
        >
          Fit
        </button>
      </div>
      {viewMetrics ? (
        <div className="mt-1 grid gap-1 font-mono text-[11px] leading-4 theme-text-muted">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>distance {viewMetrics.distance}</span>
            <span>azimuth {viewMetrics.azimuthDegrees}deg</span>
            <span>polar {viewMetrics.polarDegrees}deg</span>
          </div>
          <div>camera [{viewMetrics.cameraPosition.join(", ")}]</div>
          <div className="flex items-center gap-2">
            <button
              aria-label="Capture current 3D view"
              className="inline-flex h-5 w-5 items-center justify-center text-current transition hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={status !== "ready"}
              onClick={handleCapturePreview}
              type="button"
            >
              <FontAwesomeIcon className="h-3.5 w-3.5" icon={faCamera} title="Capture current 3D view" />
            </button>
            <button
              aria-label="Replace current 3D model"
              className="inline-flex h-5 w-5 items-center justify-center text-current transition hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={status !== "ready"}
              onClick={onRequestReplaceModel}
              type="button"
            >
              <FontAwesomeIcon className="h-3.5 w-3.5" icon={faTrashCan} title="Replace current 3D model" />
            </button>
          </div>
        </div>
      ) : null}
      {isCaptureConfirmationOpen ? (
        <ConfirmationDialog
          actions={
            <>
              <button
                className="min-h-10 border theme-border-panel theme-bg-input px-4 py-2 text-sm font-semibold theme-text-primary transition theme-hover-bg-panel"
                onClick={handleCloseCaptureConfirmation}
                type="button"
              >
                Cancel
              </button>
              <button
                className="min-h-10 border theme-border-panel theme-bg-input px-4 py-2 text-sm font-semibold theme-text-primary transition theme-hover-bg-panel disabled:cursor-not-allowed disabled:opacity-45"
                disabled={isSavingCapture || !captureImageUrl}
                onClick={handleConfirmCaptureReplacement}
                type="button"
              >
                {isSavingCapture ? "Replacing..." : "Replace"}
              </button>
            </>
          }
          description="Replace THIS with the NEW image?"
          title="Replace THIS with the NEW image?"
        >
          {captureImageUrl ? (
            <div className="grid gap-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid justify-items-center gap-2">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">This</div>
                  {currentImageUrl ? (
                    <img
                      alt={`${itemName} current item image`}
                      className="h-32 w-32 object-contain"
                      height={128}
                      src={currentImageUrl}
                      width={128}
                    />
                  ) : (
                    <div className="grid h-32 w-32 place-items-center border border-dashed theme-border-panel text-xs theme-text-muted">
                      No current image
                    </div>
                  )}
                </div>
                <div className="grid justify-items-center gap-2">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">New</div>
                  <img
                    alt={`${itemName} captured preview`}
                    className="h-32 w-32 object-contain"
                    height={128}
                    src={captureImageUrl}
                    width={128}
                  />
                </div>
              </div>
              <div className="text-center text-xs theme-text-muted">
                The capture will be saved as a transparent 128x128 PNG.
              </div>
            </div>
          ) : null}
          {captureError ? <div className="text-sm theme-text-muted">{captureError}</div> : null}
        </ConfirmationDialog>
      ) : null}
    </div>
  );
}
