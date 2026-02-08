#!/usr/bin/env python3
import os
import cairosvg

# List of SVG files to convert
svg_files = [
    'calendar.svg',
    'layout-grid.svg',
    'map-pin.svg',
    'map.svg',
    'upload.svg',
    'list.svg'
]

# Convert each SVG to PNG with white color for visibility on dark backgrounds
for svg_file in svg_files:
    if os.path.exists(svg_file):
        png_file = svg_file.replace('.svg', '.png')
        print(f"Converting {svg_file} to {png_file}...")
        try:
            cairosvg.svg2png(
                url=svg_file,
                write_to=png_file,
                output_width=32,
                output_height=32,
                background_color=None  # Transparent background
            )
            print(f"  ✓ Created {png_file}")
        except Exception as e:
            print(f"  ✗ Error: {e}")
    else:
        print(f"  ✗ File not found: {svg_file}")

print("\nConversion complete!")
