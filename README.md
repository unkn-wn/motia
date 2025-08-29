# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

# Spark - Music Annotation Studio

A modern web application designed for video creators and music producers to annotate audio files with time-stamped notes and visual markers.

## Features

### 🎵 Audio Upload & Processing
- Drag-and-drop interface for audio files
- Support for major audio formats (MP3, WAV, M4A, etc.)
- Real-time file processing with visual feedback

### 🌊 Interactive Waveform
- High-quality waveform visualization using WaveSurfer.js
- Click anywhere on the waveform to add time-stamped notes
- Audio playback controls with seek functionality
- Volume control slider

### 📝 Smart Note System
- Click-to-create notes at any point in the audio
- Color-coded note system (5 different colors)
- Inline editing of note content
- Time-stamped annotations with precise positioning

### 🎨 Beautiful UI/UX
- Modern gradient design with Tailwind CSS
- Responsive layout that works on all devices
- Smooth animations and transitions
- Custom scrollbars and form elements

### 📋 Notes Management
- Sidebar with chronological note listing
- Jump-to-time functionality for each note
- Color picker for note organization
- Delete and edit notes easily

## Tech Stack

- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Audio**: WaveSurfer.js for waveform visualization
- **Icons**: Lucide React
- **Build Tool**: Vite
- **Package Manager**: npm

## Getting Started

### Prerequisites
- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/unkn-wn/spark.git
cd spark
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Usage

1. **Upload Audio**: Drag and drop an audio file or click "Choose File"
2. **View Waveform**: The audio will be processed and displayed as an interactive waveform
3. **Add Notes**: Click anywhere on the waveform to create a time-stamped note
4. **Edit Notes**: Click on any note to edit its content
5. **Organize**: Use the color picker to categorize your notes
6. **Navigate**: Use the sidebar to jump between notes chronologically

## Project Structure

```
src/
├── components/
│   ├── FileUploader.tsx      # Drag-and-drop file upload component
│   ├── WaveformPlayer.tsx    # Audio waveform visualization and controls
│   ├── NotesOverlay.tsx      # Overlay for displaying notes on waveform
│   └── NotesSidebar.tsx      # Sidebar for note management
├── home.tsx                  # Main application component
├── main.tsx                  # Application entry point
└── style.css                 # Global styles and custom CSS
```

## Future Enhancements (Roadmap)

- **Firebase Integration**: Cloud storage and real-time collaboration
- **Drawing Tools**: Visual annotations and sketches on waveform
- **Export Features**: Export annotations as JSON, PDF, or audio markers
- **Collaboration**: Share projects with team members
- **Audio Effects**: Basic audio processing and filtering
- **Keyboard Shortcuts**: Power-user features for faster workflow
- **Template System**: Pre-built annotation templates for different use cases

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [WaveSurfer.js](https://wavesurfer.xyz/) for excellent audio visualization
- [Tailwind CSS](https://tailwindcss.com/) for the beautiful styling system
- [Lucide](https://lucide.dev/) for the clean, modern icons

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
