import assert from 'node:assert';
import { describe, it } from '#test';
import { SchemaGraph, SchemaNode } from '#root/lib/schema-graph.js';

describe('SchemaGraph', () => {
  class MethodName {
    static alias = 'method_name';
    decode () { return 'decoded'; }
    encode () { return 'encoded'; }
    format () { return 'formatted'; }
    parse () { return 'parsed'; }
  }

  const mock_typeset = {
    types: Object.fromEntries([
      MethodName
    ].map(Type => [Type.alias, Type])),
    has (alias) {
      return alias in this.types;
    },
    get (alias) {
      return this.types[alias];
    }
  };

  describe('Compilation', () => {
    it('throws when executing an uncompiled graph', () => {
      const graph = new SchemaGraph('test', mock_typeset);
      assert.throws(
        () => graph.execute({}, root_node => root_node.format()),
        /Cannot read properties of null/
      );
    });

    it('successfully executes after compilation', () => {
      const graph = new SchemaGraph('test', mock_typeset).compile({
        $type: 'method_name',
        $name: 'testNode'
      });

      assert.deepStrictEqual(
        graph.execute({}, root => root.format(null)),
        'formatted'
      );
    });
  });

  describe('Runtime Execution', () => {
    it('binds and unbinds a session', () => {
      const graph = new SchemaGraph('test', mock_typeset);
      const fetch_result = 'foobar';
      const session = { fetch: () => fetch_result };
      graph.bind(session);
      // Let's ensure runtime is accessible.
      graph.run({ name: 'test', type: 'test' }, api => {
        assert.strictEqual(api.fetch(), fetch_result);
      });
      graph.unbind();
      assert.throws(
        () => graph.run({}, () => {}),
        /Cannot read properties of null/
      );
    });

    it('guarantees unbind on execution failure', () => {
      const graph = new SchemaGraph('test', mock_typeset).compile({
        $type: 'method_name',
        $name: 'node'
      });
      
      try { // Trigger error to force .unbind()
        graph.execute({}, () => { throw new Error('fail'); });
      } catch { /* Do nothing; Session is unbinded */ }
      
      // Second call: should NOT throw "Schema already running"
      assert.doesNotThrow(
        () => graph.bind({})
      );
    });
  });

  describe('SchemaNode', () => {
    it('initializes and builds types correctly', () => {
      const graph = new SchemaGraph('test', mock_typeset);
      const node = new SchemaNode({
        name: 'test',
        Type: MethodName,
        args: {},
        root: graph
      });
      
      node.build({ item: () => {} });
      assert.strictEqual(node.name, 'test');
      assert.strictEqual(node.type, 'method_name');
    });
  });
});
