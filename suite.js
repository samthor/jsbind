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

  suite('each', function() {
    
    test('test array', function() {
      const out = JSBind('<template each="x"><div>v{{y}}</div></template>', {x: [1, 2, 3], y: 100});
      const node = createNode(out);
      assert.equal(node.innerHTML, '<div>v100</div><div>v100</div><div>v100</div><!-- x -->');

      out.update('y', 200);
      assert.equal(node.innerHTML, '<div>v200</div><div>v200</div><div>v200</div><!-- x -->');

      out.update('x', [1]);
      assert.equal(node.innerHTML, '<div>v200</div><!-- x -->', 'global values should appear');

      out.update('x', []);
      assert.equal(node.innerHTML, '<!-- x -->');
    });

    test('test nuke/add each', function() {
      const out = JSBind('<template each="x"><div>v{{y}}</div></template>', {});
      const node = createNode(out);
      assert.equal(node.innerHTML, '<!-- x -->');

      out.update('x.banana.zing', 1);
      assert.equal(node.innerHTML, '<div>v</div><!-- x -->');

      out.update('x.apple', 1);
      assert.equal(node.innerHTML, '<div>v</div><div>v</div><!-- x -->');

      out.update('x.banana.whatever.ignored', 1);
      assert.equal(node.innerHTML, '<div>v</div><div>v</div><!-- x -->');

      out.update('x.banana', null);
      assert.equal(node.innerHTML, '<div>v</div><!-- x -->');
    });

    test('test map', function() {
      const out = JSBind('<template each="x"><div>v{{y}}</div></template>', {});
      const node = createNode(out);
      assert.equal(node.innerHTML, '<!-- x -->');

      const map = new Map();
      map.set(1, 2);
      map.set(3, 4);
      out.update('x', map);

      assert.equal(node.innerHTML, '<div>v</div><div>v</div><!-- x -->');
    });

    test('test values', function() {
      const out = JSBind('<template each="x"><div>v{{$}}</div></template>', {x: ['X']});
      const node = createNode(out);
      assert.equal(node.innerHTML, '<div>vX</div><!-- x -->');

      // TODO: this does work, but is it a bug? do we care?
      out.update('$', 'WRONG');
      assert.equal(node.innerHTML, '<div>vWRONG</div><!-- x -->');
    });

    test('test poke', function() {
      const out = JSBind('<template each="x">{{$.length}},</template>', {x: {'0': 'a', '1': 'bb'}});
      const node = createNode(out);
      assert.equal(node.innerHTML, '1,2,<!-- x -->');

      out.update('x.0.length', 100);
      assert.equal(node.innerHTML, '100,2,<!-- x -->');
    });

    test('test recurse', function() {
      const data = {x: {
        '0': {name: 'Hello', stuff: {'0': 1, '1': 2, '2': 3}},
        '1': {name: 'There', stuff: {'0': 4, '1': 5, '2': 6}},
      }};
      const out = JSBind('<template each="x"><div>{{$.name}}</div><template each="$.stuff">{{$}}<br /></template></template>', data);
      const node = createNode(out);
      assert.equal(node.innerHTML, '<div>Hello</div>1<br>2<br>3<br><!-- $.stuff --><div>There</div>4<br>5<br>6<br><!-- $.stuff --><!-- x -->');

      out.update('x.1.stuff.1', 100);
      assert.equal(node.innerHTML, '<div>Hello</div>1<br>2<br>3<br><!-- $.stuff --><div>There</div>4<br>100<br>6<br><!-- $.stuff --><!-- x -->');

      out.update('x', [{name: 'What'}]);
      assert.equal(node.innerHTML, '<div>What</div><!-- $.stuff --><!-- x -->');
    });


  });

}();
