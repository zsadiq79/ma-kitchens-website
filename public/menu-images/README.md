# Ma Kitchens dish images

This folder contains Ma Kitchens customer-facing dish images.

- Image filenames must use the Dish ID, not the dish name.
- Supported MVP formats are `.jpg`, `.jpeg`, `.png`, and `.webp`.
- JPG/JPEG/PNG are preferred for dishes that need to pass through the Google Slides menu generator because WebP has been less reliable with the Slides image replacement API.
- `.jpg` and `.jpeg` are both valid filename extensions for JPEG images.
- Example filenames: `DISH-001.jpg`, `DISH-002.jpeg`, `DISH-003.png`, and `DISH-004.webp`.
- Example public URLs:
  - `https://www.makitchens.com.au/menu-images/DISH-001.jpg`
  - `https://www.makitchens.com.au/menu-images/DISH-002.jpeg`
  - `https://www.makitchens.com.au/menu-images/DISH-003.png`
  - `https://www.makitchens.com.au/menu-images/DISH-004.webp`
- Do not rename an existing image file when a dish name changes.
- When updating a dish photo, replace the existing image using the same Dish ID filename and extension where practical.
- Do not create a public image-gallery page from this folder.
- Do not fake-convert an image by changing only its file extension; the extension must match the actual image format.
