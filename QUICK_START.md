# Quick Start Guide

## Auto-Load Your WAD File

For the best experience, copy your DOOM WAD file to the `public/` folder:

```bash
# Example: Copy your WAD file
cp /path/to/your/DOOM1.WAD public/doom1.wad
```

### Supported WAD filenames (checked in order):
1. `public/doom1.wad`
2. `public/doom.wad`
3. `public/DOOM1.WAD`
4. `public/DOOM.WAD`

## Start the Server

```bash
npm run dev
```

That's it! The app will automatically:
- Detect and load your WAD file
- Display all available maps
- Auto-select E1M1 (if available) or the first map
- Be ready to play immediately

## Manual Upload (Alternative)

If you don't copy the WAD to `public/`, you can still:
1. Click "Load WAD File" button
2. Select your WAD file
3. Choose a map and start playing

## Controls

- **WASD** - Move
- **Mouse** - Look around  
- **Click** - Lock pointer (to play)
- **ESC** - Release pointer

## Troubleshooting

**WAD not loading automatically?**
- Make sure the filename matches one of the supported names
- Check the browser console for error messages
- Try refreshing the page (Ctrl+R / Cmd+R)

**Performance issues?**
- Try a smaller map (E1M1 is usually good)
- Close other browser tabs
- Check browser console for warnings

