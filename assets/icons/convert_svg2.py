#!/usr/bin/env python3
import os
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
from PIL import Image

# List of SVG files to convert
svg_files = [
    'calendar.svg',
    'layout-grid.svg',
    'map-pin.svg',
    'map.svg',
    'upload.svg',
    'list.svg'
]

# Convert each SVG to PNG
for svg_file in svg_files:
    if os.path.exists(svg_file):
        png_file = svg_file.replace('.svg', '.png')
        print(f"Converting {svg_file} to {png_file}...")
        try:
            # Convert SVG to drawing
            drawing = svg2rlg(svg_file)
            
            # Scale to 32x32
            scale = 32 / max(drawing.width, drawing.height)
            drawing.width = drawing.width * scale
            drawing.height = drawing.height * scale
            drawing.scale(scale, scale)
            
            # Render to PNG
            renderPM.drawToFile(drawing, png_file, fmt="PNG")
            
            print(f"  ✓ Created {png_file}")
        except Exception as e:
            print(f"  ✗ Error: {e}")
    else:
        print(f"  ✗ File not found: {svg_file}")

print("\nConversion complete!")
