export const languageColors = {
  Go: '#00ADD8',
  Rust: '#dea584',
  C: '#555555',
  'C++': '#f34b7d',
  Lua: '#000080',
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Swift: '#F05138',
  Java: '#b07219',
  PHP: '#4F5D95',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
};

export const languageColor = (name) => languageColors[name] ?? 'var(--color-rule-2)';
