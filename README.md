
JSBind is a quick tool to generate HTML binding helpers.

Usage-

```html
<template id="t">
  <h2 class$="cl">Hello, {{name}}</h2>
  <div>Name length: {{name.length}}</div>
  <template each="emojis">
    <div>{{$.name}}, {{$.value}}</div>
  </template>
</template>
<script>
  var data = {
    cl: 'some-class-name',
    name: 'Sam'
  };
  var out = JSBind(t, data);
  holder.appendChild(out.root);

  // Now, you can call update to update the DOM. This will update all descendents, such
  // as `name.length`.
  out.update('name', 'Jim');

  // You can also update properties to types which aren't expected.
  out.update('name.length', 'Not really a length');

  // Finally, lists or iterables also work.
  out.update('emojis', [{name: 'Peach', value: '🍑'}, {name: 'Train', value: '🚂'}]);

</script>
```

When update is called, everything under the passed key is updated.
e.g., if your template contains `a.b` and `a.c`, an update like `{a: {b: 1}}` will clear `a.c`.

### Known Bugs

Issues are around each templates, which are tricky.

#### Each Templates

* Updating `"foo.0"` works, but it will always treat the key as a string - not useful for an `Array` (or `Map` with number key)
  * ...it should _maybe_ support updating `["foo", 0]` or some other syntax for breaking args
* top-level data inside an each template won't exist for new DOM nodes
  * ...it should update the `template` itself over time
* only the value is accessible (via `$`)
* it's impossible to access the parent of recursive each templates (i.e., `$` for my parent)

### Possible Additions

* Conditionals (but perhaps you should use `hidden` or other attributes instead)
* Computed properties (e.g., `{{foo(bar, zing)}}`)
* Better attribute syntax (Polymer always uses `foo$="{{bar}}"`, we only support `foo$="bar"`)
* Two-way attribute binding (e.g., `[[foo]]` as well as `{{foo}}`)
* Property binding (e.g., `.hidden` not `hidden=""`)
