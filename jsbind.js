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
  function getOuter(code) {
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
   * @param {!Object<!Array<function(string)>>} binding
   * @param {string} key
   * @param {function(string)} helper
   */
  function bindingPush(binding, key, helper) {
    let arr = binding[key];
    if (arr === undefined) {
      binding[key] = arr = [];
    }
    arr.push(helper);
  }

  /**
   * Node in the JSBind update tree.
   */
  class JSBindNode {
    constructor() {
      this.children = {};
      this.helpers = [];
    }

    child(x) {
      let out = this.children[x];
      if (!out) {
        out = this.children[x] = new JSBindNode();
      }
      return out;
    }

    update(value) {
      this.helpers.forEach(helper => helper(value));
    }
  }

  const re = new RegExp(/{{(.*?)}}/g);

  /**
   * @param {string} text of HTML nodes to generate bindings for
   * @param {!Object<!Array<function(string)>>} binding
   * @return {Node}
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
      bindingPush(binding, match[1], bindTextContent.bind(node));
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
   * @param {!Node} node to generate bindings for
   * @param {!Object<!Array<function(string)>>} binding
   */
  function convertNode(node, binding) {
    const pending = [node];
    let n;
    while ((n = pending.shift())) {
      if (n instanceof HTMLTemplateElement) {
        if (n.getAttribute('each') === null) {
          throw new Error('unhandled: ' + n.localName);
        }

        const template = n;
        const placeholder = document.createComment('');
        n.parentNode.replaceChild(placeholder, n);

        const factory = function(value) {
          const localBinding = {};
          const root = template.content.cloneNode(true);
          const fragment = document.createDocumentFragment();
          while (root.childNodes.length) {
            fragment.appendChild(root.childNodes[0]);
          }
          convertNode(fragment, localBinding);

          // TODO(samthor): This is just a quick demo. But loops now cause our binding state to
          // be mutable(-ish) over time.
          // QQ: Do we care about 'items.0.foo'? Can just 'items' be notified?
          // AA: I think we want specific notification. And ignore the idea that we're an array...
          // basically 'items' becomes parent to a keyed object. You can poke any key under that.
          // 'items.banana' being poked => creates/removes banana (undefined or not).
          // If you poke the whole thing, items, recreate whole thing. Look at length etc.
          if ('' in localBinding) {
            localBinding[''].forEach(fn => fn(value));
          }
          return fragment;
        };
        const groups = [];

        bindingPush(binding, n.getAttribute('each'), function(array) {
          while (groups.length) {
            const group = groups.shift();
            group.forEach(node => node.remove());
          }

          let lastNode = placeholder;
          array.forEach(value => {
            const fragment = factory(value);
            const group = [...fragment.childNodes];
            placeholder.parentNode.insertBefore(fragment, lastNode.nextSibling);
            if (group.length) {
              lastNode = group[group.length - 1];
            }
            groups.push(group);
          });
        });

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
          bindingPush(binding, found[attr], bindAttribute.bind(n.attributes[attr]));
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
    const binding = {};

    // Traverse the entire DOM, finding insertion points.
    const outer = getOuter(code);
    convertNode(outer, binding);

    // Builds mapNodes and the tree of updatable nodes in this JSBind.
    const rootNode = new JSBindNode();
    const mapNodes = {'': rootNode};
    for (let k in binding) {
      const more = k.split('.');
      const flatKey = [];

      let node = rootNode;
      while (more.length) {
        const next = more.shift();
        flatKey.push(next);
        node = node.child(next);
        mapNodes[flatKey.join('.')] = node;
      }
      node.helpers.push(...binding[k]);
    }

    /**
     * @param {string} k to update at
     * @param {*} value to update with
     */
    function update(k, value) {
      const first = mapNodes[k || ''];
      if (!first) { return; }  // invalid target

      const pending = [{node: first, value}];
      while (pending.length) {
        const {node, value} = pending.shift();
        node.update(value);

        for (let k in node.children) {
          const nextValue = (value === null || value === undefined ? undefined : value[k]);
          pending.push({node: node.children[k], value: nextValue});
        }
      }
    }

    update('', opt_data);
    return {root: outer, update};
  };
}(window));
