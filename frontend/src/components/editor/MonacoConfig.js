// ==============================================================================
// Monaco Editor Production Configuration & Language Templates
// ==============================================================================

export const SUPPORTED_LANGUAGES = [
  { id: 'python', name: 'Python 3', monacoLang: 'python', ext: 'py' },
  { id: 'java', name: 'Java 17', monacoLang: 'java', ext: 'java' },
  { id: 'c', name: 'C (GCC)', monacoLang: 'c', ext: 'c' },
  { id: 'cpp', name: 'C++ (G++)', monacoLang: 'cpp', ext: 'cpp' },
];

export const LANGUAGE_TEMPLATES = {
  python: `# Solution in Python 3\n\ndef main():\n    # Write your code here\n    print("Hello CodeArena")\n\nif __name__ == "__main__":\n    main()\n`,
  java: `// Solution in Java 17\nimport java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Write your code here\n        System.out.println("Hello CodeArena");\n    }\n}\n`,
  c: `// Solution in C (GCC)\n#include <stdio.h>\n\nint main() {\n    // Write your code here\n    printf("Hello CodeArena\\n");\n    return 0;\n}\n`,
  cpp: `// Solution in C++ (G++)\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your code here\n    cout << "Hello CodeArena" << endl;\n    return 0;\n}\n`,
};

export const FONT_SIZES = [12, 14, 16, 18, 20, 22];

export const getMonacoOptions = ({ fontSize = 14, readOnly = false, minimap = false, theme = 'vs-dark' }) => ({
  fontSize: fontSize,
  readOnly: readOnly,
  minimap: { enabled: minimap },
  theme: theme,
  automaticLayout: true,
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  lineNumbers: 'on',
  renderLineHighlight: 'all',
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  smoothScrolling: true,
  tabSize: 4,
  insertSpaces: true,
  folding: true,
  bracketPairColorization: { enabled: true },
  autoClosingBrackets: 'always',
  autoClosingQuotes: 'always',
  formatOnPaste: true,
  formatOnType: true,
  selectionHighlight: true,
  contextmenu: true,
  mouseWheelZoom: true,
  padding: { top: 12, bottom: 12 },
  fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, Monaco, monospace",
  fontLigatures: true,
});
