
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

  // Now, you can call update to update the DOM. This will update all descendents, such
  // as `name.length`.
  out.update('name', 'Jim');

  // You can also update properties to types which aren't expected.
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
