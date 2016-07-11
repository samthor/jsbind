'use strict';

(function(scope) {
//  const nodeProto = document.registerElement('jsbind-node');

  function bindAttribute(value) {
    this.value = value;
  }
  function bindTextContent(value) {
    this.textContent = value;
  }
  function getOuter(code) {
    if (code instanceof HTMLTemplateElement) {
      return document.importNode(code.content, true);
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
    while (holder.children.length) {
      fragment.appendChild(holder.children[0]);
    }
    return fragment;
  }

  window['JSBind'] = function(code, opt_data) {
    const binding = {};
    function addBinding(value, helper) {
      let arr = binding[value];
      if (arr === undefined) {
        binding[value] = arr = [];
      }
      arr.push(helper);
    }

    const re = new RegExp(/{{(.*?)}}/g);
    function convert(text) {
      const fragment = document.createDocumentFragment();
      function appendTextNode(text) {
        const node = document.createTextNode(text);
        fragment.appendChild(node);
        return node;
      }

      let atIndex = 0;
      let match;
      while ((match = re.exec(text)) !== null) {
        if (match.index > atIndex) {
          appendTextNode(text.substring(atIndex, match.index));
          atIndex = re.lastIndex;  // step over match
        }

        const node = appendTextNode('');
        fragment.appendChild(node);
        addBinding(match[1], bindTextContent.bind(node));
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

    // Traverse the entire DOM, finding insertion points.
    const outer = getOuter(code);
    const pending = [outer];
    let n;
    while ((n = pending.shift())) {
      pending.push(...n.childNodes);

      if (n instanceof Text) {
        // TODO: matches e.g. any HTMLElement, although doesn't do anything
        const out = convert(n.wholeText);
        if (out) {
          n.parentNode.replaceChild(out, n);
        }
      }

      // TODO: looks for attr$="bound", but Polymer uses attr$="{{bound}}" syntax
      if ('attributes' in n) {
        const found = {};
        for (let i = 0, curr; curr = n.attributes[i]; ++i) {
          if (curr.name.substring(curr.name.length - 1) == '$') {
            const attr = curr.name.substr(0, curr.name.length - 1);
            found[attr] = curr.value;
          }
        }
        for (const attr in found) {
          n.removeAttribute(attr + '$');
          n.setAttribute(attr, '');
          addBinding(found[attr], bindAttribute.bind(n.attributes[attr]));
        }
      }
    }

    for (let k in binding) {
      // parses opt_data and converts to 'foo.bar' property syntax
      const parts = k.split('.');
      let curr = opt_data;
      while (parts.length) {
        if (typeof curr !== 'object') {
          break;
        }
        curr = curr[parts.shift()] || '';
      }
      binding[k].forEach(helper => helper(curr));
    }

    function update(k, value) {
      (binding[k] || []).forEach(helper => helper(value));
    }
    return {root: outer, update};
  };
}(window));
