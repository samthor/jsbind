'use strict';

(function(scope) {
  /**
   * @param {string} value
   * @this {Attr}
   */
  function bindAttribute(value) {
    this.value = value;
  }

  /**
   * @param {string} value
   * @this {Node}
   */
  function bindTextContent(value) {
    this.textContent = value;
  }

  /**
   * @param {!HTMLTemplateElement} template
   * @param {!Node} placeholder
   * @param {!Map} live
   * @return {function(*, string)}
   */
  function buildEach(template, placeholder, live) {
    const curr = new Map();

    return (value, key) => {
      if (key === undefined) {
        curr.forEach((nodes, curr) => {
          live.delete(curr);
          nodes.forEach(node => node.remove());
        });
        curr.clear();

        const before = placeholder.nextSibling;
        forEach(value, (_, k) => {
          const binding = new JSBindTemplateBuilder();
          const frag = template.content.cloneNode(true);
          convertNode(frag, binding, live);  // TODO: sub probably doesn't work (e.g. x.0.y.0)

          curr.set(frag, [...frag.children]);  // set before insertion and children disappearing
          placeholder.parentNode.insertBefore(frag, before);

          live.set(frag, {path: key + '.' + k, binding});
        });
      } else if (value == null) {
        // thing clear
        throw new Error('TODO: implement specific key clear');
      } else {
        // thing create/update
        throw new Error('TODO: implement specific key implicit creation');
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
       * @type {!Object<function(string, *)>}
       */
      this.each_ = {};
    }

    /**
     * @param {string} k
     * @param {function(string)} fn
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

        node = node.must(next);

        const key = flatKey.join('.');
        const prev = this.all_[key];
        if (prev !== undefined && prev !== node) {
          throw new Error('unexpected node in flat map: `' + key + '`');
        }
        this.all_[key] = node;
      }
      node.helpers.push(fn);
    }

    /**
     * @param {string} k to update at
     * @param {*} value to update with
     */
    update(k, value) {
      const first = this.all_[k];
      if (!first) {
        // TODO: If this is e.g., "x.0.banana", and "x" is an each, autocreate "x.0".
        // TODO: Use a regex (?) to make this matching faster, e.g. /^x\.\w+\./
        return;  // invalid target
      }

      const pending = [{node: first, value}];
      while (pending.length) {
        const {node, value} = pending.shift();
        node.run(value);

        for (let k in node.children) {
          const nextValue = (value === null || value === undefined ? undefined : value[k]);
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
   * @param {function(T, string|number)} fn
   */
  function forEach(arg, fn) {
    if (!arg) { return; }
    if (typeof arg.forEach === 'function') {
      arg.forEach(fn);
    } else {
      for (let k in arg) {
        fn(arg[k], k);
      }
    }
  }

  /**
   * @param {!Node} node to generate bindings for
   * @param {!JSBindTemplateBuilder} binding
   * @param {!Map<!Node, {path: string}>} live
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
        binding.add(each, buildEach(n, placeholder, live));
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
     * @type {!Map<!Node, {path: string}>}
     */
    const live = new Map();  // TODO: key isn't really used - just used as key (fragment!)
    const binding = new JSBindTemplateBuilder(live);

    // Traverse the entire DOM, finding insertion points.
    convertNode(outer, binding, live);
    live.set(outer, {path: '', binding});

    /**
     * @param {string} k to update at
     * @param {*} value to update with
     */
    function update(k, value) {
      live.forEach((config, node) => {
        // This always updates, because every outer

        // TODO: always update, ignoring path: flat data inside map
        // TODO: path could be e.g., "array.0", maybe?
        config.binding.update(k, value);
      });
    }

    update('', opt_data);
    return {root: outer, update};
  };
}(window));
