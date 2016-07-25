
JSBind is a quick tool to generate HTML binding helpers.

Usage-

```html
<template id="t">
  <h2 class$="cl">Hello, {{name}}</h2>
  <div>Name length: {{name.length}}</div>
</template>
<script>
  var data = {
    cl: 'some-class-name',
    name: 'Sam'
  };
  var out = JSBind(t, data);
  holder.appendChild(out.root);

  // Now, you can call update to update the DOM.
  out.update('name', 'Jim');

  // However, note that the `name.length` attribute won't be updated: each key needs to be
  // triggered uniquely.
  out.update('name.length', 'Not really a length');

</script>
```

## Notes

Possible additions-

* Array looping support (note that `{{foo.0}}` already works)
* Computed properties (e.g., `{{foo(bar, zing)}}`)
* Better attribute syntax (Polymer always uses `foo$="{{bar}}"`, we only support `foo$="bar"`)
* Two-way attribute binding (e.g., `[[foo]]` as well as `{{foo}}`)
* Property binding (e.g., `.hidden` not `hidden=""`)
* Descendant key triggering (e.g., update 'foo' with an object, should propagate to all under, e.g., 'foo.bar').
