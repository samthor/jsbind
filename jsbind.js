'use strict';

(function(scope) {
  /**
   * @param {*} value
   * @this {Attr}
   */
  function bindAttribute(value) {
    this.value = /** @type {string} */ (value);
  }

  /**
   * @param {*} value
   * @this {Node}
   */
  function bindTextContent(value) {
    this.textContent = /** @type {string} */ (value);
  }

  /**
   * @param {!HTMLTemplateElement} template
   * @param {!Node} placeholder
   * @param {!Set<!JSBindTemplateBuilder>} live
   * @return {function(*, string)}
   */
  function buildEach(template, placeholder, live) {
    const curr = new Map();
    const each = template.getAttribute('each');

    function add(value, key, rest) {
      let config = curr.get(key);
      if (!config) {
        const binding = new JSBindTemplateBuilder();
        const frag = template.content.cloneNode(true);
        convertNode(frag, binding, live);

        config = {
          binding,
          outer: frag,
          nodes: [...frag.childNodes],  // set before insertion and children disappearing
        };
        curr.set(key, config);
        placeholder.parentNode.insertBefore(frag, placeholder);

        live.add(binding);
      }

      const flatKey = '$' + (rest !== undefined ? '.' + rest : '');
      config.binding.update(flatKey, value);
    }

    function remove(key) {
      const config = curr.get(key);
      if (config) {
        curr.delete(key);
        live.delete(config.binding);
        config.binding.update('$', null);  // tell children to disappear
        config.nodes.forEach(node => node.remove());
      }
    }

    // TODO: make this into a class helper?
    return (value, key, rest) => {
      if (key === undefined) {
        if (rest !== undefined) {
          throw new TypeError('can\'t pass rest with each replace');
        }

        // This is a set of the each key directly, presumably with a new Map/Array etc.
        // TODO(samthor): Don't nuke/recreate, try to maintain parity. Of course values might be
        // different but if the keys are the same, just "change" instead of delete.
        for (const key of curr.keys()) {
          remove(key);
        }
        if (curr.size) {
          throw new Error('curr should now be empty');
        }
        forEach(value, (value, key) => add(value, key, undefined));  // rest must be undefined
      } else if (value === null && rest === undefined) {
        // Delete a specific key, e.g. "each.0" => null.
        remove(key);
      } else {
        // Create a specific key. Note that `undefined` is valid here, and creates without set.
        // Rest is passed to allow implicit creation/update of some subpath.
        add(value, key, rest);
      }
    };
  }

  /**
   * Fetches and clears the bound attributes from the passed Element.
   *
   * @param {!Element} el to process
   * @return {!Object<string>} map of bound attribute to literal bound value
   */
  function fetchBoundAttributes(el) {
    // TODO: looks for attr$="bound", but Polymer uses attr$="{{bound}}" syntax
    const found = {};
    for (let i = 0, curr; curr = el.attributes[i]; ++i) {
      if (curr.name.substring(curr.name.length - 1) === '$') {
        const attr = curr.name.substr(0, curr.name.length - 1);
        found[attr] = curr.value;
      }
    }
    for (const attr in found) {
      el.removeAttribute(attr + '$');
      el.setAttribute(attr, '');
    }
    return found;
  }

  /**
   * Normalizes and copies the passed argument to be a real, useful outer Node containing live DOM. 
   * This is just a helper for user input of strings or other HTML elements.
   *
   * @param {(HTMLElement|string)} code HTMLElement, HTMLTemplateElement or string for innerHTML
   * @return {!Node}
   */
  function cloneArgument(code) {
    if (code instanceof HTMLTemplateElement) {
      return document.importNode(code.content, true) || document.createDocumentFragment();
    } else if (code instanceof HTMLElement) {
      return document.cloneNode(true);
    }

    code = code.valueOf();
    if (typeof code !== 'string') {
      throw new TypeError('expected HTMLTemplateElement, HTMLElement or string');
    }

    const fragment = document.createDocumentFragment();
    const holder = document.createElement('div');
    holder.innerHTML = code;
    while (holder.childNodes.length) {
      fragment.appendChild(holder.childNodes[0]);
    }
    return fragment;
  }

  /**
   * @param {string} s
   * @return escaped version of string suitable for regexp
   */
  function escapeReLiteral(s) {
    return s.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
  }


  class JSBindTemplateNode {
    constructor() {
      /** @type {!Array<function(string)>} */
      this.helpers = [];

      /** @type {!Object<!JSBindTemplateNode>} */
      this.children = {};
    }

    must(x) {
      const out = this.children[x];
      if (!out) {
        return this.children[x] = new JSBindTemplateNode();
      }
      return out;
    }

    run(value) {
      this.helpers.forEach(helper => helper(value));
    }
  }

  /**
   * JSBindTemplateBuilder presents JSBindTemplateNode instances, in both a flat map and a tree.
   */
  class JSBindTemplateBuilder {
    constructor() {
      this.root = new JSBindTemplateNode();

      /**
       * @type {!Object<!JSBindTemplateNode>}
       */
      this.all_ = {'': this.root};

      // TODO: typedef/something function?
      /**
       * @type {!Object<!Array<function(*, string)>>}
       */
      this.each_ = {};
      this.eachRe_ = false;
    }

    /**
     * @param {string} k
     * @param {function(*)} fn
     */
    add(k, fn) {
      const more = k.split('.');
      const flatKey = [];

      if (more[0] === '') {
        more.shift();  // nb. this eats '.foo' as well as '.' or ''
      }

      let node = this.root;
      while (more.length) {
        const next = more.shift();
        flatKey.push(next);
        const key = flatKey.join('.');

        if (!next.startsWith('$')) {
          node = node.must(next);
        } else {
          node = this.all_[key] || new JSBindTemplateNode();  // start new root for $-prefix
        }

        const prev = this.all_[key];
        if (prev !== undefined && prev !== node) {
          throw new Error('unexpected node in flat map: `' + key + '`');
        }
        this.all_[key] = node;
      }
      node.helpers.push(fn);
    }

    /**
     * @param {string} k
     * @param {function(*, string)} fn
     */
    addEach(k, fn) {
      this.add(k, /** @type {function(*)} */ (fn));

      // TODO: this is a bit ugly vs using nodes properly
      if (!(k in this.each_)) {
        this.each_[k] = [];
      }
      this.each_[k].push(fn);

      this.eachRe_ = null;
    }

    /**
     * @param {string} k to update at
     * @param {*} value to update with
     */
    update(k, value) {
      const first = this.all_[k];
      if (!first) {
        if (this.eachRe_ === null) {
          // TODO: each could still break regep
          const safe = Object.keys(this.each_).map(escapeReLiteral);
          const s = '^(' + safe.join('|') + ')\\.(\\w+)(?:\\.(.*)|)$';
          this.eachRe_ = new RegExp(s);
        } else if (!this.eachRe_) {
          return;  // no each here
        }

        const m = this.eachRe_.exec(k);
        if (m) {
          // This found an update for a key _under_ an each.
          k = m[1];
          const key = m[2];
          const rest = m[3];  // there's more!

          this.each_[k].forEach(fn => fn(value, key, rest));
        }
        return;  // not matched
      }

      const pending = [{node: first, value}];
      while (pending.length) {
        const {node, value} = pending.shift();
        node.run(value);

        for (let k in node.children) {
          const nextValue = (value == null ? undefined : value[k]);
          pending.push({node: node.children[k], value: nextValue});
        }
      }
    }
  }

  const re = new RegExp(/{{(.*?)}}/g);

  /**
   * @param {string} text of HTML nodes to generate bindings for
   * @param {!JSBindTemplateBuilder} binding
   * @return {DocumentFragment}
   */
  function convertTextNode(text, binding) {
    const fragment = document.createDocumentFragment();
    function appendTextNode(text) {
      const node = document.createTextNode(text);
      fragment.appendChild(node);
      return node;
    }

    let atIndex = -1;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match.index > atIndex) {
        appendTextNode(text.substring(atIndex, match.index));
        atIndex = re.lastIndex;  // step over match
      }

      const node = appendTextNode('');
      fragment.appendChild(node);
      binding.add(match[1], bindTextContent.bind(node));
    }
    re.lastIndex = NaN;  // nb. Safari doesn't like -1
    if (!atIndex) {
      return null;  // don't do anything, no matches
    }

    const tail = text.substring(atIndex);
    if (tail.length) {
      appendTextNode(tail);
    }
    return fragment;
  }

  /**
   * @template T
   * @param {(!Object<T>|!Map<string, T>|!Array<T>|null)} arg
   * @param {function(T, (string|number))} fn
   */
  function forEach(arg, fn) {
    if (!arg) { return; }
    if (typeof arg.forEach === 'function') {
      arg.forEach(fn);
    } else {
      const o = /** @type {!Object|!Array} */ (arg);
      for (let k in o) {
        fn(o[k], k);
      }
    }
  }

  /**
   * @param {!Node} node to generate bindings for
   * @param {!JSBindTemplateBuilder} binding
   * @param {!Set<!JSBindTemplateBuilder>} live
   */
  function convertNode(node, binding, live) {
    const pending = [node];
    let n;
    while ((n = pending.shift())) {
      if (n instanceof HTMLTemplateElement) {
        const each = n.getAttribute('each');
        if (each === undefined) {
          throw new Error('expected template each');
        }

        const placeholder = document.createComment(' ' + each + ' ');
        n.parentNode.replaceChild(placeholder, n);
        binding.addEach(each, buildEach(n, placeholder, live));
        continue;
      }

      pending.push(...n.childNodes);

      if (n instanceof Text) {
        const out = convertTextNode(n.wholeText, binding);
        if (out) {
          n.parentNode.replaceChild(out, n);
        }
      } else if (n instanceof Element) {
        const found = fetchBoundAttributes(n);
        for (const attr in found) {
          binding.add(found[attr], bindAttribute.bind(n.attributes[attr]));
        }
      }
    }
  }

  /**
   * @param {(HTMLElement|string)} code
   * @param {*=} opt_data
   * @return {{root: !Node, update: function(string, *)}}
   */
  scope['JSBind'] = function(code, opt_data) {
    const outer = cloneArgument(code);

    /**
     * @type {!Set<!JSBindTemplateBuilder>}
     */
    const live = new Set();
    const binding = new JSBindTemplateBuilder();

    // Traverse the entire DOM, finding insertion points.
    convertNode(outer, binding, live);
    live.add(binding);

    /**
     * @param {string} k to update at
     * @param {*} value to update with
     */
    function update(k, value) {
        // This always updates, because every outer can still have top-level args.
      live.forEach(binding => binding.update(k, value));
    }

    update('', opt_data);
    return {root: outer, update};
  };
}(window));
