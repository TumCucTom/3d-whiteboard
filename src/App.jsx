// Gesture-based 2D to 3D whiteboard (Browser version using MediaPipe and Three.js)
import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

export default function Gesture3DWhiteboard() {
    const canvasRef = useRef();
    const videoRef = useRef();
    const [is3DMode, setIs3DMode] = useState(false);
    const [showWebcam, setShowWebcam] = useState(false);
    const sceneRef = useRef(new THREE.Scene());
    const rendererRef = useRef();
    const camera3DRef = useRef();
    const pointer = useRef(null);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });

    useEffect(() => {
        // Setup three.js scene
        const width = window.innerWidth;
        const height = window.innerHeight;
        const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true });
        renderer.setSize(width, height);
        renderer.setClearColor(0xffffff, 1); // Default white background
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
        const hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.8,
            minTrackingConfidence: 0.8,
        });

        hands.onResults(onResults);

        if (videoRef.current) {
            const camera = new Camera(videoRef.current, {
                onFrame: async () => await hands.send({ image: videoRef.current }),
                width: 640,
                height: 480,
            });
            camera.start();
        }
    }, []);

    const onResults = (results) => {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const indexTip = landmarks[8];
            const thumbTip = landmarks[4];

            const pinchDistance = Math.sqrt(
                Math.pow(indexTip.x - thumbTip.x, 2) +
                Math.pow(indexTip.y - thumbTip.y, 2)
            );

            const isPinching = pinchDistance < 0.03;
            if (isPinching && !is3DMode) setIs3DMode(true);
            if (!isPinching && is3DMode) setIs3DMode(false);

            if (is3DMode) {
                const x = (indexTip.x - 0.5) * 10;
                const y = -(indexTip.y - 0.5) * 10;
                const z = (pinchDistance - 0.015) * 100;

                const newPoint = new THREE.Vector3(x, y, z);
                if (!pointer.current) {
                    pointer.current = [newPoint];
                } else {
                    pointer.current.push(newPoint);
                }

                const geometry = new THREE.BufferGeometry().setFromPoints(pointer.current);
                const line = new THREE.Line(geometry, lineMaterial);
                sceneRef.current.add(line);
            } else {
                pointer.current = null;
            }
        }
    };

    return (
        <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
            <video
                ref={videoRef}
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: showWebcam ? "block" : "none",
                    zIndex: 0
                }}
                width="640"
                height="480"
                autoPlay
                muted
                playsInline
            />
            <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, zIndex: 1 }} />
            <div
                style={{
                    position: "absolute",
                    top: 20,
                    left: 20,
                    padding: "10px 20px",
                    background: is3DMode ? "limegreen" : "gray",
                    color: "white",
                    borderRadius: "8px",
                    zIndex: 2
                }}
            >
                {is3DMode ? "3D Mode" : "2D Mode (gesture to switch)"}
            </div>
            <button
                onClick={() => setShowWebcam(!showWebcam)}
                style={{
                    position: "absolute",
                    top: 70,
                    left: 20,
                    padding: "10px 20px",
                    background: showWebcam ? "darkred" : "steelblue",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    zIndex: 2
                }}
            >
                {showWebcam ? "Hide Webcam" : "Show Webcam"}
            </button>
        </div>
    );
}
