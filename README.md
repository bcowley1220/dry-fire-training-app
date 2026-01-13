# Dry-Fire Laser Trainer

A web-based dry-fire training application that uses your device's camera to detect laser training rounds and track your shooting performance. Perfect for practicing draw speed, accuracy, and shot placement without live ammunition.

This is just a demo version to do proof of concept testing.

## Features

### 🎯 Camera-Based Laser Detection
- **Automatic Detection**: Detects red and green laser training rounds in real-time
- **Zone-Based Scoring**: Supports IPSC-style zones (A, C, D) with customizable point values
- **Multiple Target Modes**:
  - **Preloaded Templates**: IPSC Classic, IPSC Modified, and other standard targets
  - **Custom Zones**: Define your own zone boundaries visually
  - **Freeform Mode**: Track hits without zone restrictions

### ⏱️ Shot Timer
- **Random Start Delay**: Configurable random delay (2-5 seconds default) before the beep
- **Draw Time Measurement**: Measures time from beep to first shot
- **Automatic Next Round**: Set number of rounds and reset duration for continuous practice
- **Session Statistics**: Track average, best, and worst times across multiple reps
- **False Start Detection**: Alerts if you shoot before the beep

### 📊 Shot Analysis
- **Shot Sequence Visualization**: See your shot pattern with numbered hits and connecting lines
- **Zone Distribution**: View hit distribution across zones
- **Shot Group Analysis**: Calculate group size and spread
- **Replay Mode**: Review shots one at a time
- **Export**: Export shot patterns for analysis

### 📱 Responsive Design
- **Mobile-Friendly**: Works on phones, tablets, and desktops
- **Touch Controls**: Full touch support for calibration and navigation
- **Camera Zoom & Pan**: Pinch to zoom and drag to pan the camera view

## Prerequisites

- **Node.js**: Version 18 or higher
- **npm** or **yarn**: Package manager
- **Modern Web Browser**: Chrome, Firefox, Safari, or Edge (latest versions)
- **Webcam/Camera**: Built-in or external camera for laser detection
- **Laser Training Round**: Red or green laser training cartridge

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd dry-fire-trainer
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

## Running the Application

### Development Mode

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the port shown in the terminal).

To automatically open in your browser:

```bash
npm run dev -- --open
```

### Production Build

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## How to Use

### Initial Setup

1. **Grant Camera Permissions**: When you first open the app, your browser will prompt for camera access. Click "Allow" to enable camera detection.

2. **Position Your Target**: 
   - Place a target (calendar, paper target, or any flat surface) on a wall
   - Ensure good lighting
   - Position your device/camera 5-6 feet away from the target
   - Make sure the target is clearly visible in the camera feed

3. **Calibrate the Target**:
   - Click **"Calibrate Target"**
   - Tap the **4 corners** of your target **clockwise**:
     - Top-left corner
     - Top-right corner
     - Bottom-right corner
     - Bottom-left corner
   - The app will draw a green dashed outline around your target area

### Target Modes

#### Preloaded Templates
- Select a template (e.g., "IPSC Classic")
- Calibrate your target
- Zones will automatically load after calibration

#### Custom Zones
- Select "Custom" mode
- Calibrate your target
- Click **"Define Zones Visually"**
- Define zones A, C, and D by tapping their corners
- Set point values for each zone

#### Freeform Mode
- Select "Freeform" mode
- No calibration required
- All hits are tracked regardless of location

### Using the Shot Timer

1. **Configure Settings**:
   - **Random Delay**: Set min/max delay before beep (default: 2-5 seconds)
   - **Beep Volume**: Adjust volume slider
   - **Auto Next Round** (optional):
     - Enable checkbox
     - Set number of rounds (1-100)
     - Set reset duration (1-10 seconds)

2. **Start a Session**:
   - Click **"I'm Ready - Start Drill"**
   - Get into position
   - Wait for the beep
   - Draw and shoot on the beep

3. **View Results**:
   - After each shot, see your draw time and hit zone
   - View session statistics
   - Review shot sequence visualization

### Detection Tips

- **Lighting**: Ensure adequate lighting, but avoid direct sunlight on the target
- **Distance**: Optimal distance is 5-6 feet from target
- **Red Objects**: Remove red objects from the camera view to avoid false positives
- **Laser Brightness**: Ensure your laser training round is fully charged
- **Camera Position**: Keep camera steady for best detection

### Debug Mode

If detection isn't working:
1. Click **"Debug"** button
2. Point your laser at the target
3. You'll see red/green dots on pixels that match detection criteria
4. Check the console (F12) for RGB values and detection logs

## Troubleshooting

### Camera Not Working
- **Check Permissions**: Ensure camera permissions are granted in browser settings
- **Try Different Browser**: Some browsers handle camera access differently
- **Check Camera**: Make sure no other app is using the camera
- **HTTPS Required**: Some browsers require HTTPS for camera access (localhost is OK)

### Detection Not Working
- **Enable Debug Mode**: Use the Debug button to see what pixels are being detected
- **Check Lighting**: Ensure adequate but not excessive lighting
- **Remove Red Objects**: Red objects in view can cause false positives
- **Adjust Distance**: Try moving closer or further from target
- **Clean Camera Lens**: Ensure camera lens is clean

### False Positives
- **Remove Red Objects**: Remove red items from camera view
- **Adjust Detection**: The app uses color thresholds - very bright red objects may trigger detection
- **Use Debug Mode**: Identify what's causing false positives

### Shot Timer Issues
- **No Beep**: Check volume settings and browser audio permissions
- **False Start Alert**: Make sure you're waiting for the beep before shooting
- **Timer Not Starting**: Ensure you've clicked "I'm Ready - Start Drill"

### Performance Issues
- **Close Other Tabs**: Camera processing is resource-intensive
- **Lower Resolution**: Some devices may struggle with high-resolution video
- **Update Browser**: Ensure you're using the latest browser version

## Technical Details

### Technology Stack
- **Framework**: SvelteKit 2.x
- **Styling**: Tailwind CSS 4.x
- **Build Tool**: Vite
- **Language**: JavaScript (ES6+)

### Detection Algorithm
- **Color Thresholds**: 
  - Red: R > 150, G < 70, B < 70
  - Green: G > 150, R < 70, B < 70
- **Cluster Detection**: Groups nearby pixels to identify laser dots
- **Minimum Size**: Requires at least 2 pixels for a valid hit
- **Real-time Processing**: Processes every frame at video frame rate

### Browser Compatibility
- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari (iOS 11+)
- ⚠️ Older browsers may have limited camera support

### Performance
- **Frame Rate**: Typically 30-60 FPS depending on device
- **Latency**: Detection latency is typically <100ms
- **CPU Usage**: Moderate - camera processing is CPU-intensive

## Development

### Project Structure
```
dry-fire-trainer/
├── src/
│   ├── routes/
│   │   ├── +page.svelte      # Main application
│   │   └── +layout.svelte    # Layout wrapper
│   └── lib/
│       └── components/
│           └── MobileLayout.svelte
├── static/                    # Static assets
├── package.json
└── README.md
```

### Code Formatting
```bash
npm run format    # Format code with Prettier
npm run lint      # Check code formatting and linting
```

### Key Functions
- `detectLaserDots()`: Main detection algorithm
- `handleTimerHit()`: Processes hits during shot timer
- `startDrill()`: Initiates shot timer sequence
- `calibrateTarget()`: Handles target calibration

## Contributing

When testing, please report:
- Browser and version
- Device type (mobile/tablet/desktop)
- Camera resolution
- Any errors in browser console (F12)
- Steps to reproduce issues

## License

[Add your license here]

## Acknowledgments

Built for dry-fire training enthusiasts who want to improve their shooting skills safely and effectively.

---

**Note**: This application requires camera access and processes video in real-time. Ensure you have adequate device performance and battery life for extended training sessions.
