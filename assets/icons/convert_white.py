#!/usr/bin/env python3
import os
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
from PIL import Image, ImageOps

# List of SVG files to convert
svg_files = [
    'calendar.svg',
    'layout-grid.svg',
    'map-pin.svg',
    'map.svg',
    'upload.svg',
    'list.svg'
]

# Convert each SVG to PNG with white color
for svg_file in svg_files:
    if os.path.exists(svg_file):
        png_file = svg_file.replace('.svg', '.png')
        print(f"Converting {svg_file} to {png_file} (white)...")
        try:
            # Convert SVG to drawing
            drawing = svg2rlg(svg_file)
            
            # Scale to 32x32
            scale = 32 / max(drawing.width, drawing.height)
            drawing.width = drawing.width * scale
            drawing.height = drawing.height * scale
            drawing.scale(scale, scale)
            
            # Render to PNG (with transparent background)
            renderPM.drawToFile(drawing, png_file, fmt="PNG")
            
            # Open with PIL and convert to white
            img = Image.open(png_file)
            
            # Convert to RGBA if not already
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            
            # Get alpha channel
            data = img.getdata()
            
            # Create new data with white color where there's alpha
            new_data = []
            for item in data:
                r, g, b, a = item
                if a > 0:  # If pixel is not transparent
                    # Set to white while preserving alpha
                    new_data.append((255, 255, 255, a))
                else:
                    new_data.append((0, 0, 0, 0))  # Keep transparent
            
            img.putdata(new_data)
            img.save(png_file)
            
            print(f"  ✓ Created {png_file} (white)")
        except Exception as e:
            print(f"  ✗ Error: {e}")
    else:
        print(f"  ✗ File not found: {svg_file}")

print("\nConversion complete!")
