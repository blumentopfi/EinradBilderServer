# Image Gallery Server

A simple, self-hosted image gallery with password authentication, perfect for Raspberry Pi deployment.

## Features

- Password-protected access (no user accounts needed)
- Responsive image gallery with grid layout
- Multi-select images with checkboxes
- Download selected images as a ZIP file
- Full-screen image preview with keyboard navigation
- Mobile-friendly interface
- Lightweight and fast

## Installation

### Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Setup Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure the server:**
   Edit `config.json` to set your preferences:
   ```json
   {
     "password": "changeme",
     "port": 3000,
     "imagesDirectory": "./images"
   }
   ```

   - `password`: The password for accessing the gallery
   - `port`: The port to run the server on
   - `imagesDirectory`: Path to the directory containing your images

3. **Add your images:**
   Place your image files in the `images` directory (or the directory specified in config.json).
   Supported formats: JPG, JPEG, PNG, GIF, WEBP, BMP

4. **Start the server:**
   ```bash
   npm start
   ```

5. **Access the gallery:**
   Open your browser and navigate to `http://localhost:3000`
   (or use your server's IP address if accessing from another device)

## Usage

### Login
Enter the password you configured in `config.json`

### Browsing Images
- Images are displayed in a responsive grid
- Hover over images to see hover effects
- Click on an image to open full-screen preview

### Selecting Images
- Click anywhere on the card (except the image itself) to select/deselect
- Click the checkbox in the top-right corner of each image
- Use "Select All" to select all images
- Use "Deselect All" to clear selection

### Downloading Images
- Select one or more images
- Click "Download Selected"
- Images will be downloaded as a ZIP file named `images.zip`

### Preview Mode
- Click on the image itself to open preview
- Use arrow buttons or keyboard arrows to navigate
- Press ESC to close preview
- Keyboard shortcuts:
  - `←` Previous image
  - `→` Next image
  - `ESC` Close preview

## Raspberry Pi Deployment

### Installation on Raspberry Pi

1. **Install Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Clone or copy your project:**
   ```bash
   cd /home/pi
   # Copy your project files here
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Configure to run on boot (optional):**

   Create a systemd service file:
   ```bash
   sudo nano /etc/systemd/system/image-gallery.service
   ```

   Add the following content:
   ```ini
   [Unit]
   Description=Image Gallery Server
   After=network.target

   [Service]
   Type=simple
   User=pi
   WorkingDirectory=/home/pi/EinradBilderServer
   ExecStart=/usr/bin/node /home/pi/EinradBilderServer/server.js
   Restart=on-failure

   [Install]
   WantedBy=multi-user.target
   ```

   Enable and start the service:
   ```bash
   sudo systemctl enable image-gallery
   sudo systemctl start image-gallery
   ```

5. **Access from other devices:**
   Find your Raspberry Pi's IP address:
   ```bash
   hostname -I
   ```

   Access the gallery from any device on your network:
   `http://YOUR_PI_IP_ADDRESS:3000`

### Security Considerations

- Change the default password in `config.json`
- If exposing to the internet, consider using HTTPS with a reverse proxy (nginx)
- Keep your Raspberry Pi and Node.js updated
- Use a strong password
- Consider using a firewall to restrict access

## Troubleshooting

### Images not loading
- Check that images are in the correct directory
- Verify file permissions (files should be readable)
- Check supported formats: JPG, JPEG, PNG, GIF, WEBP, BMP

### Cannot access from other devices
- Ensure the Raspberry Pi and other devices are on the same network
- Check firewall settings
- Verify the correct IP address and port

### Server won't start
- Check if port 3000 is already in use
- Try changing the port in `config.json`
- Check Node.js installation: `node --version`

## Configuration Options

### Change Password
Edit `config.json` and update the `password` field. Restart the server.

### Change Port
Edit `config.json` and update the `port` field. Restart the server.

### Change Images Directory
Edit `config.json` and update the `imagesDirectory` field. Use either:
- Relative path: `"./images"` or `"../photos"`
- Absolute path: `"/home/pi/Pictures"`

## Development

To run in development mode:
```bash
npm run dev
```

## License

This project is provided as-is for personal use.
