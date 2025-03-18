// Global elements and settings
let video = document.getElementById('video');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let fileInput = document.getElementById('fileInput');
let coordsDisplay = document.getElementById('coords');
let angleDisplay = document.getElementById('angle');
let statusDisplay = document.getElementById('status');
let videoStream = null;
let useVideo = false;
const thresholdDistance = 30; // max distance in pixels for collinearity

// Set canvas dimensions
function resizeCanvas(width, height) {
    canvas.width = width;
    canvas.height = height;
}

// Start the video stream from the webcam
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
        console.error("Error accessing webcam: ", err);
        statusDisplay.textContent = "Error accessing webcam.";
    }
}

// Stop the video stream
function stopVideo() {
    useVideo = false;
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    statusDisplay.textContent = "Video stopped.";
}

// Main processing loop (runs every frame if using video)
function processFrame() {
    if (useVideo) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let dots = detectDots(imageData);
    drawDetection(dots);

    if (dots.red && dots.pink && dots.green) {
        // Red is assumed to be in front.
        // Determine which non-red dot is the middle by comparing distances from red.
        let dPink = distance(dots.red, dots.pink);
        let dGreen = distance(dots.red, dots.green);
        let middle, back;
        if (dPink < dGreen) {
            middle = dots.pink;
            back = dots.green;
        } else {
            middle = dots.green;
            back = dots.pink;
        }
        // Verify collinearity: check the distance from the middle point to the line (red-back)
        let dLine = pointLineDistance(middle, dots.red, back);
        if (dLine < thresholdDistance) {
            // Compute the angle from the middle to the red dot (in degrees)
            let angleRad = Math.atan2(dots.red.y - middle.y, dots.red.x - middle.x);
            let angleDeg = angleRad * (180 / Math.PI);
            coordsDisplay.textContent = "Red: (" + dots.red.x.toFixed(2) + ", " + dots.red.y.toFixed(2) + "), " +
                "Middle: (" + middle.x.toFixed(2) + ", " + middle.y.toFixed(2) + "), " +
                "Back: (" + back.x.toFixed(2) + ", " + back.y.toFixed(2) + ")";
            angleDisplay.textContent = "Rotation Angle (from middle to red): " + angleDeg.toFixed(2) + "°";
        } else {
            coordsDisplay.textContent = "Dots detected but not collinear within threshold.";
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

// Function to scan the image data for the three colored dots
function detectDots(imageData) {
    let width = imageData.width;
    let height = imageData.height;
    let data = imageData.data;

    // Accumulators for each color
    let redSum = { x: 0, y: 0, count: 0 };
    let pinkSum = { x: 0, y: 0, count: 0 };
    let greenSum = { x: 0, y: 0, count: 0 };

    // Loop over pixels (stepping by 2 for performance)
    for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
            let index = (y * width + x) * 4;
            let r = data[index];
            let g = data[index + 1];
            let b = data[index + 2];

            // Red dot: strong red, low green and blue
            if (r > 180 && g < 100 && b < 100) {
                redSum.x += x;
                redSum.y += y;
                redSum.count++;
            }
            // Pink dot: high red and blue (with close values), moderate green
            else if (r > 180 && b > 150 && Math.abs(r - b) < 50 && g > 80 && g < 170) {
                pinkSum.x += x;
                pinkSum.y += y;
                pinkSum.count++;
            }
            // Green dot: strong green, low red and blue
            else if (g > 180 && r < 100 && b < 100) {
                greenSum.x += x;
                greenSum.y += y;
                greenSum.count++;
            }
        }
    }

    let redPoint = redSum.count > 0 ? { x: redSum.x / redSum.count, y: redSum.y / redSum.count } : null;
    let pinkPoint = pinkSum.count > 0 ? { x: pinkSum.x / pinkSum.count, y: pinkSum.y / pinkSum.count } : null;
    let greenPoint = greenSum.count > 0 ? { x: greenSum.x / greenSum.count, y: greenSum.y / greenSum.count } : null;

    return { red: redPoint, pink: pinkPoint, green: greenPoint };
}

// Draw circles and a connecting line (for visual feedback)
function drawDetection(dots) {
    // Optionally, you might redraw the original image.
    if (dots.red) {
        drawCircle(dots.red.x, dots.red.y, 10, 'red');
    }
    if (dots.pink) {
        drawCircle(dots.pink.x, dots.pink.y, 10, 'pink');
    }
    if (dots.green) {
        drawCircle(dots.green.x, dots.green.y, 10, 'green');
    }

    // Draw a line from red to the candidate middle dot
    if (dots.red && dots.pink && dots.green) {
        let dPink = distance(dots.red, dots.pink);
        let dGreen = distance(dots.red, dots.green);
        let middle = dPink < dGreen ? dots.pink : dots.green;
        drawLine(dots.red, middle, 'yellow');
    }
}

function drawCircle(x, y, radius, color) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
}

function drawLine(p1, p2, color) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
}

// Calculate Euclidean distance between two points
function distance(p1, p2) {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

// Calculate perpendicular distance from point p to the line defined by p1 and p2
function pointLineDistance(p, p1, p2) {
    let num = Math.abs((p2.y - p1.y) * p.x - (p2.x - p1.x) * p.y + p2.x * p1.y - p2.y * p1.x);
    let den = distance(p1, p2);
    return den === 0 ? 0 : num / den;
}

// Handle image file selection; stop video processing and load the image instead.
fileInput.addEventListener('change', (e) => {
    let file = e.target.files[0];
    if (file) {
        let img = new Image();
        img.onload = function () {
            useVideo = false;
            stopVideo();
            resizeCanvas(img.width, img.height);
            ctx.drawImage(img, 0, 0);
            processFrame();
        }
        img.src = URL.createObjectURL(file);
    }
});

// Button controls for video stream
document.getElementById('startVideo').addEventListener('click', startVideo);
document.getElementById('stopVideo').addEventListener('click', stopVideo);

// Auto-start video on page load (if permission granted)
window.addEventListener('load', startVideo);