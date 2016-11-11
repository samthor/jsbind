void function() {

  function createNode(jb) {
    const div = document.createElement('div');
    div.appendChild(jb.root);
    return div;
  }

  test('parse from template node', function() {
    const t = document.createElement('template');
    t.innerHTML = `Test: {{name}}`;
    const out = JSBind(t, {name: 'Sam'});
    const node = createNode(out);
    assert.equal(node.innerHTML, 'Test: Sam');
  });

  test('simple update', function() {
    const out = JSBind('Test: {{name}}', {name: 'Bob'});
    const node = createNode(out);
    assert.equal(node.innerHTML, 'Test: Bob');
    out.update('name', 'Sam');
    assert.equal(node.innerHTML, 'Test: Sam');
    out.update('', {'name': 'Jim'});
    assert.equal(node.innerHTML, 'Test: Jim');
  });

  test('zero bind', function() {
    const out = JSBind('Test: {{}}', 'Value');
    const node = createNode(out);
    assert.equal(node.innerHTML, 'Test: Value');
    out.update('', 'Sam');
    assert.equal(node.innerHTML, 'Test: Sam');
  });

  test('multiple updates', function() {
    const out = JSBind('{{name}}\n{{name}}', {name: 'Hello'});
    const node = createNode(out);
    assert.equal(node.innerHTML, 'Hello\nHello');
    out.update('name', 'Bye');
    assert.equal(node.innerHTML, 'Bye\nBye');
  });

  test('sparse update', function() {
    const out = JSBind('Test: {{name}}, {{name.length}}', {name: 'Bob'});
    const node = createNode(out);
    assert.equal(node.innerHTML, 'Test: Bob, 3');
    out.update('name', 'James');
    assert.equal(node.innerHTML, 'Test: James, 5');
    out.update('name.length', 'Banana');
    assert.equal(node.innerHTML, 'Test: James, Banana');
    out.update('length', 'Banana');  // ignored
    assert.equal(node.innerHTML, 'Test: James, Banana');
  });

  test('initially empty', function() {
    const out = JSBind('Should be empty "{{bar}}"', {});
    const node = createNode(out);
    assert.equal(node.innerHTML, 'Should be empty ""');
    out.update('bar', 1);
    assert.equal(node.innerHTML, 'Should be empty "1"');
  });

  test('bind within html', function() {
    const data = {name: 'Sam', title: 'Senior'};
    const out = JSBind('<div>{{name}} <strong>{{title}}</strong></div>', data);
    const node = createNode(out);
    assert.equal(node.innerHTML, '<div>Sam <strong>Senior</strong></div>');
    out.update('title', 'Staff');
    assert.equal(node.innerHTML, '<div>Sam <strong>Staff</strong></div>');
  });

  test('bind html attributes', function() {
    const out = JSBind('<div id$="foo">{{bar}}</div>', {foo: 'value', bar: '1'});
    const node = createNode(out);
    assert.equal(node.innerHTML, '<div id="value">1</div>');
  });

}();