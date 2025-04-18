import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { Hands, HAND_CONNECTIONS } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";

export default function Gesture3DWhiteboard() {
    const canvasRef = useRef();
    const overlayRef = useRef();
    const videoRef = useRef();
    const [is3DMode, setIs3DMode] = useState(false);
    const [showWebcam, setShowWebcam] = useState(false);
    const sceneRef = useRef(new THREE.Scene());
    const rendererRef = useRef();
    const camera3DRef = useRef();
    const pointer = useRef(null);
    const prevTip = useRef(null);

    // Raycaster & drawing plane
    const raycasterRef = useRef(new THREE.Raycaster());
    const drawPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
    const lineMaterial = useRef(new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 15 }));

    // Scale scene to fit viewport
    const updateScale = () => {
        const scene = sceneRef.current;
        const camera = camera3DRef.current;
        const box = new THREE.Box3().setFromObject(scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        if (size.x === 0 && size.y === 0) return;

        const height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
        const width = height * camera.aspect;
        const maxDim = Math.max(size.x, size.y);
        const scaleFactor = Math.min((width * 0.9) / maxDim, (height * 0.9) / maxDim);
        scene.scale.setScalar(scaleFactor);
    };

    useEffect(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true });
        renderer.setSize(width, height);
        renderer.setClearColor(0xffffff, 0);
        rendererRef.current = renderer;

        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.z = 5;
        camera3DRef.current = camera;

        const animate = () => {
            requestAnimationFrame(animate);
            renderer.render(sceneRef.current, camera);
        };
        animate();
    }, []);

    useEffect(() => {
        const overlayCanvas = overlayRef.current;
        const overlayCtx = overlayCanvas.getContext("2d");
        overlayCanvas.width = window.innerWidth;
        overlayCanvas.height = window.innerHeight;

        const hands = new Hands({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
        hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.8, minTrackingConfidence: 0.8 });

        hands.onResults(results => {
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            if (showWebcam) overlayCtx.drawImage(videoRef.current, 0, 0, overlayCanvas.width, overlayCanvas.height);

            overlayCtx.save();
            overlayCtx.scale(-1, 1);
            overlayCtx.translate(-overlayCanvas.width, 0);
            if (results.multiHandLandmarks) {
                results.multiHandLandmarks.forEach(landmarks => {
                    drawConnectors(overlayCtx, landmarks, HAND_CONNECTIONS, { lineWidth: 6, color: "black" });
                    drawLandmarks(overlayCtx, landmarks, { radius: 5, color: "red" });
                });
            }
            overlayCtx.restore();

            if (results.multiHandLandmarks?.length) {
                const lm = results.multiHandLandmarks[0];
                const tip = lm[8], thumb = lm[4];
                const dist = Math.hypot(tip.x - thumb.x, tip.y - thumb.y);
                const pinching = dist < 0.06;
                if (pinching && !is3DMode) setIs3DMode(true);
                if (!pinching && is3DMode) setIs3DMode(false);

                if (!pinching) {
                    // DRAWING: project tip onto rotated plane
                    const camera = camera3DRef.current;
                    const planeDist = camera.position.z;
                    const heightPlane = 2 * planeDist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
                    const widthPlane = heightPlane * camera.aspect;
                    const halfWidth = widthPlane / 2;
                    const halfHeight = heightPlane / 2;

                    // Ray from camera through normalized screen point
                    const ndc = new THREE.Vector2(tip.x * 2 - 1, tip.y * -2 + 1);
                    const ray = raycasterRef.current;
                    ray.setFromCamera(ndc, camera);

                    const OI = new THREE.Vector3();
                    ray.ray.intersectPlane(drawPlane.current, OI);

                    if (pointer.current) {
                        // check if next point is outside allowed rect
                        const last = pointer.current[pointer.current.length - 1];
                        if (
                            OI.x < -halfWidth || OI.x > halfWidth ||
                            OI.y < -halfHeight || OI.y > halfHeight
                        ) {
                            // find intersection t
                            const dx = OI.x - last.x;
                            const dy = OI.y - last.y;
                            const tCandidates = [];
                            if (dx !== 0) {
                                if (OI.x < -halfWidth || OI.x > halfWidth) {
                                    const xB = OI.x > halfWidth ? halfWidth : -halfWidth;
                                    tCandidates.push((xB - last.x) / dx);
                                }
                            }
                            if (dy !== 0) {
                                if (OI.y < -halfHeight || OI.y > halfHeight) {
                                    const yB = OI.y > halfHeight ? halfHeight : -halfHeight;
                                    tCandidates.push((yB - last.y) / dy);
                                }
                            }
                            const t = Math.min(...tCandidates.filter(t => t >= 0 && t <= 1));
                            const cutPoint = last.clone().add(new THREE.Vector3(dx, dy, 0).multiplyScalar(t));

                            // finish line at cutPoint
                            pointer.current.push(cutPoint);
                            const geoEnd = new THREE.BufferGeometry().setFromPoints(pointer.current);
                            sceneRef.current.add(new THREE.Line(geoEnd, lineMaterial.current));
                            pointer.current = null;
                            return;
                        }
                    }

                    // normal case, within bounds
                    if (!pointer.current) pointer.current = [OI.clone()];
                    else pointer.current.push(OI.clone());

                    const geo = new THREE.BufferGeometry().setFromPoints(pointer.current);
                    sceneRef.current.add(new THREE.Line(geo, lineMaterial.current));
                    updateScale();
                } else {
                    // ROTATION ON PINCH
                    if (prevTip.current) {
                        const dx = tip.x - prevTip.current.x;
                        const dy = tip.y - prevTip.current.y;
                        sceneRef.current.rotation.y += dx * Math.PI;
                        sceneRef.current.rotation.x += dy * Math.PI;
                        // update plane
                        drawPlane.current.normal.set(0, 0, 1)
                            .applyQuaternion(sceneRef.current.quaternion)
                            .normalize();
                    }
                    prevTip.current = tip;
                    pointer.current = null;
                }

                if (!pinching) prevTip.current = null;
            }
        });

        if (videoRef.current) {
            const cam = new Camera(videoRef.current, { onFrame: async () => await hands.send({ image: videoRef.current }), width: 640, height: 480 });
            cam.start();
        }
    }, [showWebcam, is3DMode]);

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
            <video
                ref={videoRef}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', display: showWebcam ? 'block' : 'none', zIndex: 0, transform: 'scaleX(-1)' }}
                autoPlay muted playsInline
            />
            <canvas ref={overlayRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 1, pointerEvents: 'none' }} />
            <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 2, transform: 'scaleX(-1)' }} />
            <div style={{ position: 'absolute', top: 20, left: 20, padding: '10px 20px', background: is3DMode ? 'limegreen' : 'gray', color: 'white', borderRadius: '8px', zIndex: 3 }}>
                {is3DMode ? '3D Mode' : '2D Mode (gesture to switch)'}
            </div>
            <button
                onClick={() => setShowWebcam(v => !v)}
                style={{ position: 'absolute', top: 70, left: 20, padding: '10px 20px', background: showWebcam ? 'darkred' : 'steelblue', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', zIndex: 3 }}>
                {showWebcam ? 'Hide Webcam' : 'Show Webcam'}
            </button>
        </div>
    );
}
