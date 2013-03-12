define(function(require, exports, module) {

  function Editor(options) {
    this.init(options);
  }

  Editor.prototype.init = function(options) {
    options = options || {};
    if (options.element) {
      this.element = options.element;
    }
    options.tools = options.tools || [
      'bold', 'italic', 'separator',
      'quote', 'unordered-list', 'ordered-list', 'separator',
      'link', 'image', 'separator',
      'undo', 'redo', 'separator',
      'info', 'expand'
    ];
    options.status = options.status || ['lines', 'words', 'cursor'];

    var isMac = /Mac/.test(navigator.platform);
    var _ = function(text) {
      if (!isMac) return text.replace('Cmd', 'Ctrl');
      return text;
    };

    options.shortcuts = options.shortcuts || {
      bold: _('Cmd-B'),
      italic: _('Cmd-I'),
      link: _('Cmd-L'),
      image: _('Shift-Cmd-I'),
      'ordered-list': _('Shift-Cmd-O'),
      'unordered-list': _('Shift-Cmd-U')
    };

    var iconmap = options.iconmap = options.iconmap || {
      quote: 'quotes-left',
      'ordered-list': 'numbered-list',
      'unordered-list': 'list'
    };
    options.iconClass = function(name) {
      if (iconmap[name]) {
        name = iconmap[name];
      }
      return (options.iconPrefix || 'icon-') + name;
    };
    this.options = options;
  };

  Editor.prototype.render = function(el) {
    if (!el) {
      el = this.element || document.getElementsByTagName('textarea')[0];
    }
    this.element = el;

    var self = this;

    var keyMaps = {};
    var shortcuts = this.options.shortcuts;
    for (var key in shortcuts) {
      (function(key) {
        keyMaps[shortcuts[key]] = function(cm) {
          self.action(key, cm);
        }
      })(key);
    }

    var cm = CodeMirror.fromTextArea(el, {
      mode: 'gfm',
      theme: 'paper',
      indentWithTabs: true,
      lineNumbers: false,
      extraKeys: keyMaps
    });
    this.codemirror = cm;

    var bar = this.createToolbar();
    this.createStatusbar();

    // ie < 9 sucks
    if (!bar.classList || !bar.querySelector) return;

    cm.on('cursorActivity', function() {
      var icons = bar.getElementsByTagName('span');

      for (var i = 0; i < icons.length; i++) {
        var el = icons[i];
        el.classList.remove('active');
      }

      var stat = getState(cm);
      for (var key in stat) {
        if (stat[key]) {
          el = document.querySelector('.' + self.options.iconClass(key));
          el.classList.add('active');
        }
      }
    });
  };

  Editor.prototype.createToolbar = function(tools) {
    tools = tools || this.options.tools;

    if (!tools || tools.length === 0) return;

    var bar = document.createElement('div');
    bar.className = 'editor-toolbar';

    var self = this;

    var createIcon = function(name) {
      var el;
      if (name === 'separator') {
        el = document.createElement('i');
        el.className = name;
        el.innerHTML = '|';
        return el;
      }
      el = document.createElement('span');
      el.className = self.options.iconClass(name);
      var shortcut = self.options.shortcuts[name];
      if (shortcut) el.title = shortcut;
      return el;
    }

    var el;
    for (var i = 0; i < tools.length; i++) {
      name = tools[i];
      (function(name) {
        el = createIcon(name);
        // bind events
        el.onclick = function() {
          return self.action(name);
        };
        bar.appendChild(el);
      })(tools[i]);
    }
    var cmWrapper = this.codemirror.getWrapperElement();
    cmWrapper.parentNode.insertBefore(bar, cmWrapper);
    return bar;
  };

  Editor.prototype.createStatusbar = function(status) {
    status = status || this.options.status;

    if (!status || status.length === 0) return;

    var bar = document.createElement('div');
    bar.className = 'editor-statusbar';

    var pos, cm = this.codemirror;
    for (var i = 0; i < status.length; i++) {
      (function(name) {
        var el = document.createElement('span');
        el.className = name;
        if (name === 'words') {
          el.innerHTML = '0';
          cm.on('update', function() {
            el.innerHTML = cm.getValue().length;
          });
        } else if (name === 'lines') {
          el.innerHTML = '0';
          cm.on('update', function() {
            el.innerHTML = cm.lineCount();
          });
        } else if (name === 'cursor') {
          el.innerHTML = '0:0';
          cm.on('cursorActivity', function() {
            pos = cm.getCursor();
            el.innerHTML = pos.line + ':' + pos.ch;
          });
        }
        bar.appendChild(el);
      })(status[i]);
    }
    var cmWrapper = this.codemirror.getWrapperElement();
    cmWrapper.parentNode.insertBefore(bar, cmWrapper.nextSibling);
    return bar;
  };

  Editor.prototype.action = function(name, cm) {
    cm = cm || this.codemirror;
    if (!cm) return;
    var stat = getState(cm);

    var replaceSelection = function(start, end) {
      var pos, text;
      if (stat[name]) {
        pos = cm.getCursor('start');
        text = cm.getLine(pos.line);
        start = text.slice(0, pos.ch);
        end = text.slice(pos.ch);
        if (name === 'bold') {
          start = start.replace(/^(.*)?(\*|\_){2}(\S+.*)?$/, '$1$3');
          end = end.replace(/^(.*\S+)?(\*|\_){2}(\s+.*)?$/, '$1$3');
        } else if (name === 'italic') {
          start = start.replace(/^(.*)?(\*|\_)(\S+.*)?$/, '$1$3');
          end = end.replace(/^(.*\S+)?(\*|\_)(\s+.*)?$/, '$1$3');
        }
        cm.setLine(pos.line, start + end);
        cm.focus();
        return;
      }
      if (end === null) {
        end = '';
      } else {
        end = end || start;
      }
      text = cm.getSelection();
      pos = cm.getCursor('end');
      pos.ch += start.length;
      cm.replaceSelection(start + text + end);
      cm.setCursor(pos);
      cm.focus();
    };

    var toggleLine = function() {
      var pos = cm.getCursor('start');
      var text = cm.getLine(pos.line);

      var map;
      if (stat[name]) {
        map = {
          quote: /^(\s*)\>\s+/,
          'unordered-list': /^(\s*)(\*|\-|\+)\s+/,
          'ordered-list': /^(\s*)\d+\.\s+/
        };
        text = text.replace(map[name], '$1');
        cm.setLine(pos.line, text);
      } else {
        map = {
          quote: '> ',
          'unordered-list': '* ',
          'ordered-list': '1. '
        };
        cm.setLine(pos.line, map[name] + text);
      }
      cm.focus();
    };

    switch (name) {
      case 'bold':
        replaceSelection('**');
        break;
      case 'italic':
        replaceSelection('*');
        break;
      case 'link':
        replaceSelection('[', '](http://)');
        break;
      case 'image':
        replaceSelection('![', '](http://)');
        break;
      case 'quote':
      case 'unordered-list':
      case 'ordered-list':
        toggleLine();
        break;
      case 'undo':
        cm.undo();
        cm.focus();
        break;
      case 'redo':
        cm.redo();
        cm.focus();
        break;
    }
  };


  exports = module.exports = new Editor();
  exports.Editor = Editor;


  function getState(cm) {
    var pos = cm.getCursor('start');
    var stat = cm.getTokenAt(pos);
    if (!stat.type) return {};

    var types = stat.type.split(' ');

    var ret = {}, data, text;
    for (var i = 0; i < types.length; i++) {
      data = types[i];
      if (data === 'strong') {
        ret.bold = true;
      } else if (data === 'variable-2') {
        text = cm.getLine(pos.line);
        if (/^\s*\d+\.\s/.test(text)) {
          ret['ordered-list'] = true;
        } else {
          ret['unordered-list'] = true;
        }
      } else if (data === 'atom') {
        ret.quote = true;
      } else if (data === 'em') {
        ret.italic = true;
      }
    }
    return ret;
  }

  function toggleFullScreen() {
    // https://developer.mozilla.org/en-US/docs/DOM/Using_fullscreen_mode
    var doc = document;

    var fullscreenElement = doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement;

    var requestFullscreen = doc.requestFullscreen || doc.mozRequestFullScreen || doc.webkitRequestFullscreen;
  }
});
