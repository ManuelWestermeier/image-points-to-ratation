// Grab global elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('fileInput');
const startVideoButton = document.getElementById('startVideo');
const stopVideoButton = document.getElementById('stopVideo');
const coordsDisplay = document.getElementById('coords');
const angleDisplay = document.getElementById('angle');
const statusDisplay = document.getElementById('status');

let videoStream = null;
let useVideo = false;
let mousePos = { x: null, y: null };

// Thresholds for clustering and collinearity
const CLUSTER_RADIUS = 100; // pixels: group nearby detections into one cluster
const COLLINEARITY_THRESHOLD = 50; // pixels tolerance for a point to be considered "on the line"

// ---------- Helper Functions ----------

// Euclidean distance between two points.
function distance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// Given a list of clusters, try to add the point (x, y) to an existing cluster (if within threshold)
// Otherwise, create a new cluster.
function addToClusters(clusters, x, y, threshold) {
    for (let cluster of clusters) {
        const cx = cluster.sumX / cluster.count;
        const cy = cluster.sumY / cluster.count;
        if (distance({ x, y }, { x: cx, y: cy }) < threshold) {
            cluster.sumX += x;
            cluster.sumY += y;
            cluster.count++;
            return;
        }
    }
    clusters.push({ sumX: x, sumY: y, count: 1 });
}

// Cluster all pixels that pass the test function (color threshold)
// and return the centroid of the largest cluster, or null if none found.
function clusterColor(imageData, testFunc) {
    const clusters = [];
    const { width, height, data } = imageData;
    // Loop over pixels (step by 2 for speed)
    for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
            const index = (y * width + x) * 4;
            const r = data[index], g = data[index + 1], b = data[index + 2];
            if (testFunc(r, g, b)) {
                addToClusters(clusters, x, y, CLUSTER_RADIUS);
            }
        }
    }
    if (clusters.length === 0) return null;
    // Choose the cluster with the most pixels
    let best = clusters[0];
    for (let cluster of clusters) {
        if (cluster.count > best.count) best = cluster;
    }
    return { x: best.sumX / best.count, y: best.sumY / best.count };
}

// Color test functions using thresholds.
function isRed(r, g, b) {
    return r > 180 && g < 80 && b < 80;
}
function isPink(r, g, b) {
    return r > 180 && b > 100 && g < 30;
}
function isGreen(r, g, b) {
    return g > 180 && r < 80 && b < 80;
}

// Given three points p1, mid, p2, compute the perpendicular distance from mid to the line p1-p2.
function pointLineDistance(p, p1, p2) {
    const num = Math.abs((p2.y - p1.y) * p.x - (p2.x - p1.x) * p.y + p2.x * p1.y - p2.y * p1.x);
    const den = distance(p1, p2);
    return den === 0 ? 0 : num / den;
}

// Check if the three points are collinear (i.e. the "middle" is near the line joining the other two).
function isCollinear(p1, mid, p2, threshold) {
    return pointLineDistance(mid, p1, p2) < threshold;
}

// Check if the points are in the right order. We assume that pink is meant to be in the middle.
// One way is to check that pink lies between red and green: the sum of distances (red to pink and pink to green)
// should be nearly equal to the distance from red to green.
function checkOrder(red, pink, green, tolerance) {
    const dRP = distance(red, pink);
    const dPG = distance(pink, green);
    const dRG = distance(red, green);
    return Math.abs((dRP + dPG) - dRG) < tolerance;
}

// Given the current orientation (from the middle to red) and a target (mouse position),
// compute the rotation angle (in degrees) needed so that the dots "point" toward the target.
function computeRotation(middle, red, mouse) {
    const currentAngle = Math.atan2(red.y - middle.y, red.x - middle.x);
    const targetAngle = Math.atan2(mouse.y - middle.y, mouse.x - middle.x);
    let rotation = (targetAngle - currentAngle) * (180 / Math.PI);
    // Normalize angle to (-180, 180]
    if (rotation > 180) rotation -= 360;
    if (rotation <= -180) rotation += 360;
    return rotation;
}

// ---------- Main Processing Functions ----------

// Detect the three colored dots from the image data.
function detectDots(imageData) {
    const redPoint = clusterColor(imageData, isRed);
    const pinkPoint = clusterColor(imageData, isPink);
    const greenPoint = clusterColor(imageData, isGreen);
    return { red: redPoint, pink: pinkPoint, green: greenPoint };
}

// Draw circles for each detection.
function drawDetections(dots) {
    if (dots.red) drawCircle(dots.red.x, dots.red.y, 10, 'red');
    if (dots.pink) drawCircle(dots.pink.x, dots.pink.y, 10, 'pink');
    if (dots.green) drawCircle(dots.green.x, dots.green.y, 10, 'green');
}

// Draw a circle given a center, radius, and color.
function drawCircle(x, y, radius, color) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
}

// Draw a line between two points.
function drawLine(p1, p2, color) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
}

// Resize the canvas.
function resizeCanvas(width, height) {
    canvas.width = width;
    canvas.height = height;
}

// Process each frame from video (or after image load)
function processFrame() {
    if (useVideo) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const dots = detectDots(imageData);
    drawDetections(dots);

    if (dots.red && dots.pink && dots.green) {
        // Check collinearity (pink should be on the line from red to green)
        if (isCollinear(dots.red, dots.pink, dots.green, COLLINEARITY_THRESHOLD) &&
            checkOrder(dots.red, dots.pink, dots.green, COLLINEARITY_THRESHOLD)) {
            // Use pink as the middle point
            const middle = dots.pink;
            drawCircle(middle.x, middle.y, 8, 'yellow');

            // Draw a marker at the mouse position (if available)
            if (mousePos.x !== null && mousePos.y !== null) {
                drawCircle(mousePos.x, mousePos.y, 5, 'blue');
                drawLine(middle, mousePos, 'blue');
                const rotation = computeRotation(middle, dots.red, mousePos);
                coordsDisplay.textContent = `Middle: (${middle.x.toFixed(2)}, ${middle.y.toFixed(2)})`;
                angleDisplay.textContent = `Rotation to point toward mouse: ${rotation.toFixed(2)}°`;
            }
        } else {
            coordsDisplay.textContent = "Detected points are not collinear or in the correct order.";
            angleDisplay.textContent = "";
        }
    } else {
        coordsDisplay.textContent = "Not all dots detected.";
        angleDisplay.textContent = "";
    }

    if (useVideo) {
        requestAnimationFrame(processFrame);
    }
}

// ---------- Video and Image Handling ----------

async function startVideo() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = videoStream;
        useVideo = true;
        video.addEventListener('loadedmetadata', () => {
            resizeCanvas(video.videoWidth, video.videoHeight);
            processFrame();
        });
        statusDisplay.textContent = "Video started.";
    } catch (err) {
        console.error("Error accessing webcam:", err);
        statusDisplay.textContent = "Error accessing webcam.";
    }
}

function stopVideo() {
    useVideo = false;
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    statusDisplay.textContent = "Video stopped.";
}

// When an image file is selected, stop video and process the image.
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const img = new Image();
        img.onload = () => {
            useVideo = false;
            stopVideo();
            resizeCanvas(img.width, img.height);
            ctx.drawImage(img, 0, 0);
            processFrame();
        };
        img.src = URL.createObjectURL(file);
    }
});

// ---------- Mouse Handling ----------

// Update the mouse position relative to the canvas.
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
});

// ---------- Button Event Listeners ----------

startVideoButton.addEventListener('click', startVideo);
stopVideoButton.addEventListener('click', stopVideo);

// Auto-start video on load
window.addEventListener('load', startVideo);
