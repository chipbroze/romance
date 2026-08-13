/* global document,window */

(function () {
  document.addEventListener('DOMContentLoaded', main);

  const direct_set = new Set([
    'className', 'rows', 'value', 'type', 'placeholder'
  ]);

  function appendNode (parent, type, attributes) {
    const node = createNode(type, attributes);
    parent.appendChild(node);
    return node;
  }
  function createNode (type, attributes) {
    const node = document.createElement(type);
    for (const attribute in attributes) {
      const value = attributes[attribute];
      if (direct_set.has(attribute)) {
        node[attribute] = value;
      } else {
        node.setAttribute(attribute, value);
      }
    }
    return node;
  }

  function visibleLines (textarea) {
    const line_height = parseFloat(window.getComputedStyle(textarea).lineHeight);
    const visible_lines = textarea.rows;
    // Calculate the index of the first visible line
    const start_line = Math.floor(textarea.scrollTop / line_height);
    // Calculate the index of the last visible line
    const end_line = start_line + textarea.rows;
    // Split the text into lines
    const lines = textarea.value.split('\n');
    // Get the visible lines
    return lines.slice(start_line, end_line);
  }

  class Tile {
    constructor ({ width, height, palette }) {
      this.palette = palette;
      this.height = height;
      this.width = width;
      this.nodes = this.#createNodes();
    }

    get node () { return this.nodes.tile; }
    get grid () { return this.nodes.grid; }
    get cells () { return this.nodes.cells; }
    get textarea () { return this.nodes.textarea; }

    #createNodes () {
      const tile = createNode('div', {
        className: 'tile'
      });
      const grid = appendNode(tile, 'div', {
        className: 'grid'
      });
      const textarea = appendNode(tile, 'textarea', {
        className: 'text',
        rows: this.height
      });
      const cells = Array.from({ length: this.height }, () => {
        const row_node = appendNode(grid, 'div', {
          className: 'grid-row'
        });
        return Array.from({ length: this.width }, () => {
          const cell_node = appendNode(row_node, 'div', {
            className: 'grid-pixel'
          });
          return cell_node;
        });
      }).flat();

      textarea.addEventListener('scroll', () => this.sync());
      textarea.addEventListener('input', () => this.sync());

      return { tile, grid, cells, textarea };
    }
    appendTo (parent) {
      this.sync();
      parent.appendChild(this.node);
    }
    setCell ([x, y], val) {
      this.rows[x][y] = val;
      this.sync();
    }
    sync () {
      const lines = visibleLines(this.textarea);
      let index = 0;

      for (let line_index = 0; line_index < this.height; ++line_index) {
        const line = lines[line_index] || '';

        for (let cell_index = 0; cell_index < this.width; ++cell_index) {
          const cell = line[cell_index] || '';
          const cell_node = this.cells[index++];
          cell_node.setAttribute('data-color-index', cell);
        }
      }
    }
  }

  function createPalette (colors) {
    const palette = createNode('form', {
      id: 'palette',
      className: 'palette'
    });

    colors.forEach((color, i) => {
      const x = i.toString(16);
      const color_input = appendNode(palette, 'input', {
        id: `color_${x}`,
        className: 'hex-input',
        type: 'text',
        placeholder: 'FFFFFF',
        'data-color-index': x,
        value: color
      });

      updateColor(color);

      color_input.addEventListener('change', () => {
        updateColor(color_input.value);
      });

      function updateColor (value) {
        const hex = `#${value}`;
        document.documentElement.style.setProperty(`--color-${x}`, hex);
      }
    });

    return palette;
  }

  function main () {
    const App = document.getElementById('app');

    const colors = [
      'FFC0CB', // (Pink)
      '000000', // (Black)
      '808080', // (Gray)
      'FFFFFF', // (White)
      'FF00FF', // (Magenta)
      '00FFFF', // (Cyan)
      '800000', // (Maroon)
      '008000', // (Dark Green)
      '000080', // (Navy)
      '808000', // (Olive)
      '800080', // (Purple)
      '008080', // (Teal)
      'C0C0C0', // (Silver)
      '808080', // (Gray)
      'FFA500', // (Orange)
      'A52A2A'  // (Brown)
    ];

    const palette = createPalette(colors);
    const tile = new Tile({ width: 12, height: 30, palette: colors });
    App.appendChild(palette);
    tile.appendTo(App);
  }
})();
