// Gesture-based 2D to 3D whiteboard (Browser version using MediaPipe and Three.js)
import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";

export default function Gesture3DWhiteboard() {
    const canvasRef = useRef();
    const overlayRef = useRef();           // Canvas for drawing landmarks
    const videoRef = useRef();
    const [is3DMode, setIs3DMode] = useState(false);
    const [showWebcam, setShowWebcam] = useState(false);
    const sceneRef = useRef(new THREE.Scene());
    const rendererRef = useRef();
    const camera3DRef = useRef();
    const pointer = useRef(null);
    // Increase linewidth; note: many platforms ignore linewidth in WebGL, but we'll set it anyway
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 3 });

    useEffect(() => {
        // Setup three.js scene with transparent background
        const width = window.innerWidth;
        const height = window.innerHeight;
        const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true });
        renderer.setSize(width, height);
        renderer.setClearColor(0xffffff, 0);  // transparent background
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
        // Prepare overlay canvas
        const overlayCanvas = overlayRef.current;
        const overlayCtx = overlayCanvas.getContext("2d");
        overlayCanvas.width = window.innerWidth;
        overlayCanvas.height = window.innerHeight;

        const hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });
        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.8,
            minTrackingConfidence: 0.8,
        });

        hands.onResults((results) => {
            // Clear and draw video/frame on overlay
            overlayCtx.save();
            overlayCtx.scale(-1, 1);
            overlayCtx.translate(-overlayCanvas.width, 0);
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            if (showWebcam) {
                overlayCtx.drawImage(videoRef.current, 0, 0, overlayCanvas.width, overlayCanvas.height);
            }
            overlayCtx.restore();

            // Draw Mediapipe landmarks mirrored
            overlayCtx.save();
            overlayCtx.scale(-1, 1);
            overlayCtx.translate(-overlayCanvas.width, 0);
            if (results.multiHandLandmarks) {
                for (const landmarks of results.multiHandLandmarks) {
                    drawConnectors(overlayCtx, landmarks, Hands.HAND_CONNECTIONS, { lineWidth: 6, color: "white" });
                    drawLandmarks(overlayCtx, landmarks, { radius: 15, color: "red" });
                }
            }
            overlayCtx.restore();

            // Gesture & drawing logic remains unchanged
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                const lm = results.multiHandLandmarks[0];
                const i = lm[8], t = lm[4];
                const dist = Math.hypot(i.x - t.x, i.y - t.y);
                const pinching = dist < 0.03;
                if (pinching && !is3DMode) setIs3DMode(true);
                if (!pinching && is3DMode) setIs3DMode(false);
                if (pinching) {
                    // mirror x-axis for drawing
                    const x = (i.x - 0.5) * 10;  // no manual inversion; rely on CSS mirroring for alignment
                    const y = -(i.y - 0.5) * 10;
                    const z = (dist - 0.015) * 100;
                    const pt = new THREE.Vector3(x, y, z);
                    if (!pointer.current) pointer.current = [pt]; else pointer.current.push(pt);
                    const geo = new THREE.BufferGeometry().setFromPoints(pointer.current);
                    sceneRef.current.add(new THREE.Line(geo, lineMaterial));
                } else {
                    pointer.current = null;
                }
            }
        });

        if (videoRef.current) {
            const cam = new Camera(videoRef.current, {
                onFrame: async () => { await hands.send({ image: videoRef.current }); },
                width: 640, height: 480,
            });
            cam.start();
        }
    }, [showWebcam, is3DMode]);

    return (
        <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
            <video
                ref={videoRef}
                style={{
                    position: "absolute", top: 0, left: 0,
                    width: "100%", height: "100%", objectFit: "cover",
                    display: showWebcam ? "block" : "none", zIndex: 0,
                    transform: "scaleX(-1)"
                }}
                autoPlay muted playsInline
            />
            <canvas
                ref={overlayRef}
                style={{ position: "absolute", top: 0, left: 0, zIndex: 1, pointerEvents: "none" }}
            />
            <canvas
                ref={canvasRef}
                style={{ position: "absolute", top: 0, left: 0, zIndex: 2, transform: "scaleX(-1)" }}
            />
            <div
                style={{
                    position: "absolute", top: 20, left: 20, padding: "10px 20px",
                    background: is3DMode ? "limegreen" : "gray", color: "white",
                    borderRadius: "8px", zIndex: 3
                }}
            >
                {is3DMode ? "3D Mode" : "2D Mode (gesture to switch)"}
            </div>
            <button
                onClick={() => setShowWebcam(v => !v)}
                style={{
                    position: "absolute", top: 70, left: 20, padding: "10px 20px",
                    background: showWebcam ? "darkred" : "steelblue", color: "white",
                    border: "none", borderRadius: "8px", cursor: "pointer", zIndex: 3
                }}
            >
                {showWebcam ? "Hide Webcam" : "Show Webcam"}
            </button>
        </div>
    );
}
