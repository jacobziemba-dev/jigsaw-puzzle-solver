const video = document.getElementById('video');
const liveVideo = document.getElementById('liveVideo');
const canvas = document.getElementById('canvas');
const processCanvas = document.getElementById('processCanvas');
const referenceCanvas = document.getElementById('referenceCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d');
const processCtx = processCanvas.getContext('2d');
const referenceCtx = referenceCanvas.getContext('2d');
const overlayCtx = overlayCanvas.getContext('2d');
const imagePreview = document.getElementById('imagePreview');
const referencePreview = document.getElementById('referencePreview');
const cameraContainer = document.getElementById('cameraContainer');
const liveSolveContainer = document.getElementById('liveSolveContainer');
const previewCard = document.getElementById('previewCard');
const resultsCard = document.getElementById('resultsCard');
const statusMessage = document.getElementById('statusMessage');
const fileInput = document.getElementById('fileInput');
const referenceInput = document.getElementById('referenceInput');

let stream = null;
let liveStream = null;
let currentImage = null;
let referenceImage = null;
let referenceImageObj = null;
let detectedPieces = [];
let selectedColorGroup = null;
let liveSolveActive = false;
let overlayOpacity = 0.5;
let showGrid = true;
let cvReady = false;

// Reference image keypoints and descriptors
let refKeypoints = null;
let refDescriptors = null;

// AR/Live Solve variables
let lastProcessTime = 0;
const PROCESS_INTERVAL = 500; // Process every 500ms
let liveMatches = [];

// Show loading indicator
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('cvStatus').style.display = 'block';
});

// OpenCV.js ready callback
function onOpenCvReady() {
    cvReady = true;
    console.log('OpenCV.js is ready!');
    const cvStatus = document.getElementById('cvStatus');
    cvStatus.style.background = '#d4edda';
    cvStatus.innerHTML = '✅ OpenCV.js loaded! Advanced contour detection & ORB matching enabled.';
    setTimeout(() => {
        cvStatus.style.display = 'none';
    }, 3000);
}

// Reference image upload
document.getElementById('uploadReferenceBtn').addEventListener('click', () => {
    referenceInput.click();
});

referenceInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
            referenceImage = event.target.result;
            referencePreview.src = referenceImage;
            referencePreview.style.display = 'block';

            // Load reference image object for live mode
            referenceImageObj = new Image();
            referenceImageObj.src = referenceImage;
            await new Promise(resolve => { referenceImageObj.onload = resolve; });

            // Process reference image for features
            processReferenceImage();

            // Enable live solve button
            const liveSolveBtn = document.getElementById('liveSolveBtn');
            liveSolveBtn.disabled = false;
            liveSolveBtn.innerHTML = '<span>🎥</span> Live Solve Mode';

            showStatus('Reference image loaded! You can now use Live Solve Mode or capture pieces.', 'success');
            statusMessage.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

function processReferenceImage() {
    if (!cvReady || typeof cv === 'undefined' || !referenceImageObj) {
        console.log('Cannot process reference image yet: OpenCV not ready or image missing');
        return;
    }

    try {
        // Create a canvas to draw the reference image
        const canvas = document.createElement('canvas');
        canvas.width = referenceImageObj.width;
        canvas.height = referenceImageObj.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(referenceImageObj, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const src = cv.matFromImageData(imageData);
        const gray = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        // Initialize ORB
        const orb = new cv.ORB(2000); // More features for reference
        refKeypoints = new cv.KeyPointVector();
        refDescriptors = new cv.Mat();

        // Compute keypoints and descriptors
        orb.detectAndCompute(gray, new cv.Mat(), refKeypoints, refDescriptors);

        console.log(`Processed reference image: ${refKeypoints.size()} keypoints found`);

        // Cleanup
        src.delete();
        gray.delete();
        orb.delete();
    } catch (err) {
        console.error('Error processing reference image:', err);
    }
}

// Camera button
document.getElementById('cameraBtn').addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        video.srcObject = stream;
        video.style.display = 'block';
        cameraContainer.style.display = 'block';
        document.querySelector('.card').style.display = 'none';
    } catch (err) {
        alert('Could not access camera. Please check permissions or use "Upload Image" instead.');
        console.error('Camera error:', err);
    }
});

// Upload button
document.getElementById('uploadBtn').addEventListener('click', () => {
    fileInput.click();
});

// File input handler
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            currentImage = event.target.result;
            showPreview(currentImage);
        };
        reader.readAsDataURL(file);
    }
});

// Capture photo
document.getElementById('captureBtn').addEventListener('click', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    currentImage = canvas.toDataURL('image/jpeg', 0.9);
    stopCamera();
    showPreview(currentImage);
});

// Cancel camera
document.getElementById('cancelBtn').addEventListener('click', () => {
    stopCamera();
    document.querySelector('.card').style.display = 'block';
});

// Retake photo
document.getElementById('retakeBtn').addEventListener('click', () => {
    previewCard.style.display = 'none';
    resultsCard.style.display = 'none';
    document.querySelector('.card').style.display = 'block';
});

// Analyze button
document.getElementById('analyzeBtn').addEventListener('click', analyzePuzzle);

// Live Solve Mode button
document.getElementById('liveSolveBtn').addEventListener('click', startLiveSolve);

// Exit Live Mode
document.getElementById('exitLiveBtn').addEventListener('click', stopLiveSolve);

// Opacity slider
document.getElementById('opacitySlider').addEventListener('input', (e) => {
    overlayOpacity = e.target.value / 100;
    document.getElementById('opacityValue').textContent = e.target.value + '%';
});

// Grid toggle
document.getElementById('gridToggle').addEventListener('change', (e) => {
    showGrid = e.target.checked;
});

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.style.display = 'none';
        cameraContainer.style.display = 'none';
    }
}

function showPreview(imageSrc) {
    imagePreview.src = imageSrc;
    imagePreview.style.display = 'block';
    previewCard.style.display = 'block';
    resultsCard.style.display = 'none';
    statusMessage.style.display = 'none';
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status active ${type}`;
}

async function analyzePuzzle() {
    showStatus('🤖 AI analyzing puzzle pieces...', 'processing');
    document.getElementById('analyzeBtn').disabled = true;

    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
        // Load image
        const img = new Image();
        img.src = currentImage;
        await new Promise((resolve) => { img.onload = resolve; });

        processCanvas.width = img.width;
        processCanvas.height = img.height;
        processCtx.drawImage(img, 0, 0);

        const imageData = processCtx.getImageData(0, 0, processCanvas.width, processCanvas.height);

        // Load reference image if available
        let referenceData = null;
        if (referenceImage) {
            const refImg = new Image();
            refImg.src = referenceImage;
            await new Promise((resolve) => { refImg.onload = resolve; });

            referenceCanvas.width = refImg.width;
            referenceCanvas.height = refImg.height;
            referenceCtx.drawImage(refImg, 0, 0);
            referenceData = referenceCtx.getImageData(0, 0, referenceCanvas.width, referenceCanvas.height);
        }

        // Detect pieces with AI enhancement
        detectedPieces = detectPiecesAI(imageData, referenceData);

        // Generate AI suggestions
        const suggestions = generateAISuggestions(detectedPieces, referenceData !== null);

        // Display results
        displayResults(detectedPieces, suggestions);

        showStatus(`✅ AI detected ${detectedPieces.length} pieces with smart matching!`, 'success');
        resultsCard.style.display = 'block';
    } catch (error) {
        showStatus('Error analyzing puzzle. Please try again.', 'error');
        console.error('Analysis error:', error);
    } finally {
        document.getElementById('analyzeBtn').disabled = false;
    }
}

function detectPiecesAI(imageData, referenceData) {
    // Use OpenCV if available, otherwise fall back to simple detection
    if (cvReady && typeof cv !== 'undefined') {
        return detectPiecesOpenCV(imageData, referenceData);
    } else {
        return detectPiecesSimple(imageData, referenceData);
    }
}

function detectPiecesOpenCV(imageData, referenceData) {
    const width = imageData.width;
    const height = imageData.height;
    const pieces = [];

    try {
        // Convert image data to OpenCV Mat
        let src = cv.matFromImageData(imageData);
        let gray = new cv.Mat();
        let binary = new cv.Mat();
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();

        // Convert to grayscale
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        // Apply Gaussian blur to reduce noise
        cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);

        // Adaptive threshold for better piece detection
        cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                           cv.THRESH_BINARY_INV, 11, 2);

        // Find contours (piece boundaries)
        cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        console.log(`OpenCV detected ${contours.size()} contours`);

        // Process each contour as a potential piece
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);

            // Filter out very small contours (noise)
            if (area < 1000) continue;

            // Get bounding rectangle
            const rect = cv.boundingRect(contour);

            // Skip pieces that are too small or too large
            if (rect.width < 30 || rect.height < 30 || area > width * height * 0.3) continue;

            // Extract piece region
            const pieceData = processCtx.getImageData(rect.x, rect.y, rect.width, rect.height);

            const pieceCanvas = document.createElement('canvas');
            pieceCanvas.width = rect.width;
            pieceCanvas.height = rect.height;
            const pieceCtx = pieceCanvas.getContext('2d');
            pieceCtx.putImageData(pieceData, 0, 0);

            const colors = extractDominantColors(pieceData);
            const isEdge = detectEdgePiece(pieceData, rect.x, rect.y, width, height, Math.max(rect.width, rect.height));

            let matchPosition = null;
            let matchConfidence = 0;

            if (referenceData) {
                const match = findBestMatchORB(pieceData, referenceData, rect, colors);
                matchPosition = match.position;
                matchConfidence = match.confidence;
            }

            pieces.push({
                id: pieces.length,
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                area: area,
                thumbnail: pieceCanvas.toDataURL('image/jpeg', 0.7),
                isEdge: isEdge,
                colors: colors,
                colorGroup: categorizeColor(colors),
                matchPosition: matchPosition,
                matchConfidence: matchConfidence
            });
        }

        // Clean up
        src.delete();
        gray.delete();
        binary.delete();
        contours.delete();
        hierarchy.delete();

        console.log(`Filtered to ${pieces.length} valid pieces`);
        return pieces;

    } catch (error) {
        console.error('OpenCV error, falling back to simple detection:', error);
        return detectPiecesSimple(imageData, referenceData);
    }
}

function detectPiecesSimple(imageData, referenceData) {
    // Fallback simple grid-based detection
    const width = imageData.width;
    const height = imageData.height;
    const pieces = [];
    const gridSize = 60;

    for (let y = 0; y < height - gridSize; y += gridSize) {
        for (let x = 0; x < width - gridSize; x += gridSize) {
            const pieceData = processCtx.getImageData(x, y, gridSize, gridSize);

            if (!isEmptyRegion(pieceData)) {
                const pieceCanvas = document.createElement('canvas');
                pieceCanvas.width = gridSize;
                pieceCanvas.height = gridSize;
                const pieceCtx = pieceCanvas.getContext('2d');
                pieceCtx.putImageData(pieceData, 0, 0);

                const colors = extractDominantColors(pieceData);
                const isEdge = detectEdgePiece(pieceData, x, y, width, height, gridSize);

                let matchPosition = null;
                let matchConfidence = 0;

                if (referenceData) {
                    const match = findBestMatch(pieceData, referenceData, colors);
                    matchPosition = match.position;
                    matchConfidence = match.confidence;
                }

                pieces.push({
                    id: pieces.length,
                    x, y,
                    width: gridSize,
                    height: gridSize,
                    thumbnail: pieceCanvas.toDataURL('image/jpeg', 0.7),
                    isEdge: isEdge,
                    colors: colors,
                    colorGroup: categorizeColor(colors),
                    matchPosition: matchPosition,
                    matchConfidence: matchConfidence
                });
            }
        }
    }

    return pieces;
}

function isEmptyRegion(imageData) {
    const data = imageData.data;
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
        totalBrightness += (data[i] + data[i+1] + data[i+2]) / 3;
    }
    const avgBrightness = totalBrightness / (data.length / 4);
    return avgBrightness > 240; // Too bright = empty/white background
}

function detectEdgePiece(imageData, x, y, imgWidth, imgHeight, gridSize) {
    // Check if piece is near image border
    return x < gridSize || y < gridSize ||
           x > imgWidth - gridSize * 2 || y > imgHeight - gridSize * 2;
}

function extractDominantColors(imageData) {
    const data = imageData.data;
    let r = 0, g = 0, b = 0, count = 0;

    for (let i = 0; i < data.length; i += 40) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
    }

    return {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count)
    };
}

function categorizeColor(colors) {
    const { r, g, b } = colors;
    const brightness = (r + g + b) / 3;

    // Determine dominant color
    if (brightness > 200) return { name: 'Light', color: '#f8f9fa' };
    if (brightness < 60) return { name: 'Dark', color: '#343a40' };

    if (b > r && b > g) return { name: 'Blue', color: '#007bff' };
    if (g > r && g > b) return { name: 'Green', color: '#28a745' };
    if (r > g && r > b) {
        if (g > 100) return { name: 'Yellow/Orange', color: '#ffc107' };
        return { name: 'Red', color: '#dc3545' };
    }

    return { name: 'Mixed', color: '#6c757d' };
}

function findBestMatchORB(pieceData, referenceData, rect, colors) {
    // Use ORB feature matching if OpenCV is available
    if (cvReady && typeof cv !== 'undefined') {
        try {
            // Convert to OpenCV Mat
            let pieceMat = cv.matFromImageData(pieceData);
            let pieceGray = new cv.Mat();
            cv.cvtColor(pieceMat, pieceGray, cv.COLOR_RGBA2GRAY);

            let refMat = cv.matFromImageData(referenceData);
            let refGray = new cv.Mat();
            cv.cvtColor(refMat, refGray, cv.COLOR_RGBA2GRAY);

            // Use ORB for feature detection (faster than SIFT)
            let orb = new cv.ORB(500);
            let kp1 = new cv.KeyPointVector();
            let kp2 = new cv.KeyPointVector();
            let des1 = new cv.Mat();
            let des2 = new cv.Mat();

            orb.detectAndCompute(pieceGray, new cv.Mat(), kp1, des1);
            orb.detectAndCompute(refGray, new cv.Mat(), kp2, des2);

            // Match features using BFMatcher
            let bf = new cv.BFMatcher(cv.NORM_HAMMING, true);
            let matches = new cv.DMatchVector();
            bf.match(des1, des2, matches);

            // Find best matches and calculate position
            let bestMatchCount = 0;
            let bestPosition = null;

            if (matches.size() > 5) {
                // Get average position from matched keypoints
                let avgX = 0, avgY = 0;
                const matchCount = Math.min(matches.size(), 20);

                for (let i = 0; i < matchCount; i++) {
                    const match = matches.get(i);
                    const kp = kp2.get(match.trainIdx);
                    avgX += kp.pt.x;
                    avgY += kp.pt.y;
                }

                avgX /= matchCount;
                avgY /= matchCount;

                bestPosition = { x: Math.round(avgX), y: Math.round(avgY) };
                bestMatchCount = matches.size();
            }

            // Clean up
            pieceMat.delete();
            pieceGray.delete();
            refMat.delete();
            refGray.delete();
            kp1.delete();
            kp2.delete();
            des1.delete();
            des2.delete();
            matches.delete();

            // Calculate confidence based on matches and color similarity
            const colorConf = colorSimilarity(colors, extractRegionColors(referenceData,
                bestPosition ? bestPosition.x : 0,
                bestPosition ? bestPosition.y : 0, 50));

            const featureConf = Math.min(100, (bestMatchCount / 10) * 50);
            const totalConf = Math.round((colorConf * 0.4) + (featureConf * 0.6));

            return {
                position: bestPosition,
                confidence: totalConf
            };

        } catch (error) {
            console.error('ORB matching error:', error);
            return findBestMatch(pieceData, referenceData, colors);
        }
    } else {
        return findBestMatch(pieceData, referenceData, colors);
    }
}

function findBestMatch(pieceData, referenceData, colors) {
    // Simple matching based on color similarity
    const refWidth = referenceData.width;
    const refHeight = referenceData.height;
    const pieceColors = colors;

    let bestMatch = { position: null, confidence: 0 };
    const sampleSize = 50;

    for (let y = 0; y < refHeight - sampleSize; y += sampleSize) {
        for (let x = 0; x < refWidth - sampleSize; x += sampleSize) {
            const refColors = extractRegionColors(referenceData, x, y, sampleSize);
            const similarity = colorSimilarity(pieceColors, refColors);

            if (similarity > bestMatch.confidence) {
                bestMatch = {
                    position: { x, y },
                    confidence: similarity
                };
            }
        }
    }

    return bestMatch;
}

function extractRegionColors(imageData, x, y, size) {
    const data = imageData.data;
    const width = imageData.width;
    let r = 0, g = 0, b = 0, count = 0;

    for (let dy = 0; dy < size; dy += 5) {
        for (let dx = 0; dx < size; dx += 5) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
        }
    }

    return {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count)
    };
}

function colorSimilarity(color1, color2) {
    const rDiff = Math.abs(color1.r - color2.r);
    const gDiff = Math.abs(color1.g - color2.g);
    const bDiff = Math.abs(color1.b - color2.b);
    const totalDiff = rDiff + gDiff + bDiff;
    return Math.max(0, 100 - (totalDiff / 7.65)); // Convert to 0-100 percentage
}

function generateAISuggestions(pieces, hasReference) {
    const suggestions = [];
    const edgePieces = pieces.filter(p => p.isEdge);
    const cornerPieces = edgePieces.filter(p =>
        (p.x < 100 && p.y < 100) ||
        (p.x < 100 && p.y > processCanvas.height - 100)
    );

    suggestions.push("Start with edge and corner pieces to build the frame");

    const colorGroups = {};
    pieces.forEach(p => {
        const colorName = p.colorGroup.name;
        colorGroups[colorName] = (colorGroups[colorName] || 0) + 1;
    });

    const sortedColors = Object.entries(colorGroups).sort((a, b) => b[1] - a[1]);
    if (sortedColors.length > 0) {
        suggestions.push(`Group pieces by color: ${sortedColors[0][0]} has the most pieces (${sortedColors[0][1]})`);
    }

    if (hasReference) {
        suggestions.push("Using reference image for AI-powered piece matching");
        const highConfidenceMatches = pieces.filter(p => p.matchConfidence > 70).length;
        if (highConfidenceMatches > 0) {
            suggestions.push(`Found ${highConfidenceMatches} high-confidence matches with reference`);
        }
    } else {
        suggestions.push("💡 Tip: Upload a reference image for AI matching suggestions");
    }

    suggestions.push("Look for unique patterns and distinctive colors to guide assembly");

    return suggestions;
}

function displayResults(pieces, suggestions) {
    // Update stats
    document.getElementById('piecesCount').textContent = pieces.length;
    const edgeCount = pieces.filter(p => p.isEdge).length;
    document.getElementById('edgePieces').textContent = edgeCount;

    // Color groups
    const colorGroups = {};
    pieces.forEach(p => {
        colorGroups[p.colorGroup.name] = p.colorGroup;
    });
    document.getElementById('colorGroups').textContent = Object.keys(colorGroups).length;

    // Average match confidence
    const avgConfidence = pieces.length > 0
        ? Math.round(pieces.reduce((sum, p) => sum + p.matchConfidence, 0) / pieces.length)
        : 0;
    document.getElementById('matchConfidence').textContent = avgConfidence + '%';

    // Display suggestions
    const aiSuggestion = document.getElementById('aiSuggestion');
    const suggestionsList = document.getElementById('suggestionsList');
    suggestionsList.innerHTML = suggestions.map(s => `<li>${s}</li>`).join('');
    aiSuggestion.style.display = 'block';

    // Display color filter buttons
    const colorGroupsContainer = document.getElementById('colorGroupsContainer');
    colorGroupsContainer.innerHTML = '<div class="color-group" onclick="filterByColor(null)" style="background: white; border: 2px solid #667eea;">All Pieces</div>';

    Object.entries(colorGroups).forEach(([name, group]) => {
        const btn = document.createElement('div');
        btn.className = 'color-group';
        btn.style.background = group.color;
        btn.style.color = ['Light', 'Yellow/Orange'].includes(name) ? '#333' : 'white';
        btn.textContent = name;
        btn.onclick = () => filterByColor(name);
        colorGroupsContainer.appendChild(btn);
    });

    // Display pieces
    displayPieces(pieces);
}

function filterByColor(colorName) {
    selectedColorGroup = colorName;
    displayPieces(detectedPieces);

    // Update active state
    document.querySelectorAll('.color-group').forEach(el => {
        el.classList.remove('active');
    });
    event.target.classList.add('active');
}

function displayPieces(pieces) {
    const container = document.getElementById('piecesContainer');
    container.innerHTML = '<div class="pieces-grid" id="piecesGrid"></div>';
    const grid = document.getElementById('piecesGrid');

    const filteredPieces = selectedColorGroup
        ? pieces.filter(p => p.colorGroup.name === selectedColorGroup)
        : pieces;

    filteredPieces.forEach((piece, idx) => {
        const pieceCard = document.createElement('div');
        pieceCard.className = 'piece-card';

        let matchInfo = '';
        if (piece.matchConfidence > 50) {
            matchInfo = `<div class="piece-match">✓ ${Math.round(piece.matchConfidence)}% match</div>`;
        }

        pieceCard.innerHTML = `
            <img src="${piece.thumbnail}" alt="Piece ${piece.id + 1}">
            <div class="piece-info">
                ${piece.isEdge ? '🔲 Edge' : '🧩 Interior'}
                <br>${piece.colorGroup.name}
            </div>
            ${matchInfo}
        `;
        grid.appendChild(pieceCard);
    });
}

// Make filterByColor available globally
window.filterByColor = filterByColor;

// Live Solve Mode Functions
async function startLiveSolve() {
    if (!referenceImageObj) {
        alert('Please upload a reference image first!');
        return;
    }

    try {
        liveStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        });

        liveVideo.srcObject = liveStream;
        liveVideo.style.display = 'block';
        liveSolveContainer.style.display = 'block';
        document.querySelector('.card').style.display = 'none';
        previewCard.style.display = 'none';
        resultsCard.style.display = 'none';

        // Wait for video to be ready
        await new Promise(resolve => {
            liveVideo.onloadedmetadata = () => {
                overlayCanvas.width = liveVideo.videoWidth;
                overlayCanvas.height = liveVideo.videoHeight;
                overlayCanvas.style.display = 'block';
                resolve();
            };
        });

        liveSolveActive = true;
        renderLiveOverlay();
    } catch (err) {
        alert('Could not access camera. Please check permissions.');
        console.error('Camera error:', err);
    }
}

function stopLiveSolve() {
    liveSolveActive = false;
    if (liveStream) {
        liveStream.getTracks().forEach(track => track.stop());
        liveVideo.style.display = 'none';
        overlayCanvas.style.display = 'none';
        liveSolveContainer.style.display = 'none';
    }
    document.querySelector('.card').style.display = 'block';
}

function renderLiveOverlay(timestamp) {
    if (!liveSolveActive) return;

    const width = overlayCanvas.width;
    const height = overlayCanvas.height;

    // Process frame for AR logic
    if (timestamp - lastProcessTime > PROCESS_INTERVAL) {
        processLiveFrame();
        lastProcessTime = timestamp;
    }

    // Clear canvas
    overlayCtx.clearRect(0, 0, width, height);

    // Draw reference image overlay
    let refDrawInfo = null;

    if (referenceImageObj && overlayOpacity > 0) {
        overlayCtx.globalAlpha = overlayOpacity;

        // Calculate aspect ratio and positioning to fit reference in video frame
        const videoAspect = width / height;
        const refAspect = referenceImageObj.width / referenceImageObj.height;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (refAspect > videoAspect) {
            // Reference is wider
            drawWidth = width;
            drawHeight = width / refAspect;
            offsetX = 0;
            offsetY = (height - drawHeight) / 2;
        } else {
            // Reference is taller
            drawHeight = height;
            drawWidth = height * refAspect;
            offsetX = (width - drawWidth) / 2;
            offsetY = 0;
        }

        overlayCtx.drawImage(referenceImageObj, offsetX, offsetY, drawWidth, drawHeight);
        overlayCtx.globalAlpha = 1.0;

        // Store reference drawing info for AR vector calculation
        refDrawInfo = { x: offsetX, y: offsetY, width: drawWidth, height: drawHeight };
    }

    // Draw AR Matches (Green boxes and arrows)
    if (liveMatches.length > 0 && refDrawInfo) {
        overlayCtx.lineWidth = 3;
        overlayCtx.font = 'bold 14px Arial';

        for (const match of liveMatches) {
            // Scale coordinates if processing was done on a smaller image
            const scaleX = width / processCanvas.width;
            const scaleY = height / processCanvas.height;

            const rectX = match.rect.x * scaleX;
            const rectY = match.rect.y * scaleY;
            const rectW = match.rect.width * scaleX;
            const rectH = match.rect.height * scaleY;

            // Draw bounding box around piece
            overlayCtx.strokeStyle = '#00ff00'; // Green
            overlayCtx.strokeRect(rectX, rectY, rectW, rectH);

            // Calculate target position on screen
            // match.target is normalized (0-1) relative to reference image
            const targetX = refDrawInfo.x + (match.target.x * refDrawInfo.width);
            const targetY = refDrawInfo.y + (match.target.y * refDrawInfo.height);

            // Draw line/arrow to target
            const centerX = rectX + rectW / 2;
            const centerY = rectY + rectH / 2;

            overlayCtx.beginPath();
            overlayCtx.moveTo(centerX, centerY);
            overlayCtx.lineTo(targetX, targetY);
            overlayCtx.strokeStyle = '#ffff00'; // Yellow line
            overlayCtx.stroke();

            // Draw target circle
            overlayCtx.beginPath();
            overlayCtx.arc(targetX, targetY, 5, 0, 2 * Math.PI);
            overlayCtx.fillStyle = '#ffff00';
            overlayCtx.fill();

            // Label
            overlayCtx.fillStyle = '#00ff00';
            overlayCtx.fillText(`${match.confidence}%`, rectX, rectY - 5);
        }
    }

    // Draw grid overlay
    if (showGrid) {
        overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        overlayCtx.lineWidth = 1;

        const gridSize = 50;
        for (let x = 0; x < width; x += gridSize) {
            overlayCtx.beginPath();
            overlayCtx.moveTo(x, 0);
            overlayCtx.lineTo(x, height);
            overlayCtx.stroke();
        }
        for (let y = 0; y < height; y += gridSize) {
            overlayCtx.beginPath();
            overlayCtx.moveTo(0, y);
            overlayCtx.lineTo(width, y);
            overlayCtx.stroke();
        }

        // Draw center crosshair
        overlayCtx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        overlayCtx.lineWidth = 2;
        overlayCtx.beginPath();
        overlayCtx.moveTo(width / 2 - 20, height / 2);
        overlayCtx.lineTo(width / 2 + 20, height / 2);
        overlayCtx.moveTo(width / 2, height / 2 - 20);
        overlayCtx.lineTo(width / 2, height / 2 + 20);
        overlayCtx.stroke();
    }

    // Continue animation loop
    requestAnimationFrame(renderLiveOverlay);
}

function processLiveFrame() {
    if (!cvReady || typeof cv === 'undefined' || !refDescriptors || !refKeypoints) return;

    try {
        // Set process canvas size (smaller for performance)
        const processWidth = 640;
        const processHeight = Math.round(liveVideo.videoHeight * (processWidth / liveVideo.videoWidth));

        processCanvas.width = processWidth;
        processCanvas.height = processHeight;
        processCtx.drawImage(liveVideo, 0, 0, processWidth, processHeight);

        const imageData = processCtx.getImageData(0, 0, processWidth, processHeight);

        // OpenCV Processing
        let src = cv.matFromImageData(imageData);
        let gray = new cv.Mat();
        let binary = new cv.Mat();
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
        cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

        cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        const newMatches = [];
        const orb = new cv.ORB(500);
        const bf = new cv.BFMatcher(cv.NORM_HAMMING, true);

        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);

            // Filter noise and huge blobs
            if (area < 500 || area > (processWidth * processHeight * 0.5)) continue;

            const rect = cv.boundingRect(contour);

            // Create ROI for the piece
            let roi = gray.roi(rect);
            let kp = new cv.KeyPointVector();
            let des = new cv.Mat();
            let mask = new cv.Mat(); // Create mask

            orb.detectAndCompute(roi, mask, kp, des); // Use mask

            if (!des.empty() && des.rows > 0 && !refDescriptors.empty()) {
                let matches = new cv.DMatchVector();
                bf.match(des, refDescriptors, matches);

                // Calculate average position of matches on the reference image
                let sumX = 0, sumY = 0;
                let validMatches = 0;

                // Only consider good matches
                const goodMatches = [];
                for(let j = 0; j < matches.size(); j++) {
                    goodMatches.push(matches.get(j));
                }

                // Sort by distance
                goodMatches.sort((a, b) => a.distance - b.distance);

                // Take top matches
                const topN = Math.min(10, goodMatches.length);
                if (topN > 3) {
                     for(let j = 0; j < topN; j++) {
                        const m = goodMatches[j];
                        const refKp = refKeypoints.get(m.trainIdx);
                        sumX += refKp.pt.x;
                        sumY += refKp.pt.y;
                        validMatches++;
                    }
                }

                if (validMatches > 3) {
                    const avgX = sumX / validMatches;
                    const avgY = sumY / validMatches;

                    // Normalize target position (0-1)
                    const targetX = avgX / referenceImageObj.width;
                    const targetY = avgY / referenceImageObj.height;

                    // Calculate confidence (simple metric based on number of matches and distance)
                    // Ideally this would be more robust
                    const confidence = Math.min(100, validMatches * 10);

                    if (confidence > 40) {
                        newMatches.push({
                            rect: rect,
                            target: { x: targetX, y: targetY },
                            confidence: Math.round(confidence)
                        });
                    }
                }

                matches.delete();
            }

            // Clean up ROI variables
            roi.delete();
            kp.delete();
            des.delete();
            mask.delete(); // Delete mask
        }

        liveMatches = newMatches;

        // Cleanup
        src.delete();
        gray.delete();
        binary.delete();
        contours.delete();
        hierarchy.delete();
        orb.delete();
        bf.delete();

    } catch (err) {
        console.error('Error in processLiveFrame:', err);
    }
}
