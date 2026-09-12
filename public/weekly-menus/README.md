# Ma Kitchens weekly menus

This folder contains the finished weekly menu pages shown on `https://www.makitchens.com.au/menu`.

## How publishing works

- Create one folder per delivery date using `YYYY-MM-DD` format.
- Put the finished menu pages inside that folder.
- Name the pages `page-1.png`, `page-2.png`, `page-3.png`, and so on.
- `.png`, `.jpg`, `.jpeg`, and `.webp` are supported.
- The newest dated folder that contains at least one valid `page-N` image automatically becomes the current weekly menu.
- Older dated folders automatically appear under Previous menus.
- Do not delete old dated folders if you want those menus to remain available in the archive.
- No website code needs to be edited when publishing a new menu.

Example:

```text
public/
  weekly-menus/
    2026-09-17/
      page-1.png
      page-2.png
    2026-09-24/
      page-1.png
      page-2.png
      page-3.png
```

In this example, `2026-09-24` is automatically shown as the current menu and `2026-09-17` is automatically moved into Previous menus.

## Weekly publishing steps

1. Generate the final menu PNG files.
2. Create a new folder named with the delivery date, for example `2026-09-24`.
3. Upload the files as `page-1.png`, `page-2.png`, etc.
4. Commit the new folder to `main`.
5. Vercel redeploys the site automatically.
6. Check `https://www.makitchens.com.au/menu` after deployment.
