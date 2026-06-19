import { describe, it, expect } from '@jest/globals';
import { planImportOrder, type Relation } from './import-order.js';

describe('planImportOrder', () => {
  it('linear: places referenced collection before referencing one', () => {
    const collections = ['A', 'B'];
    const relations: Relation[] = [
      { collection: 'B', field: 'a', relatedCollection: 'A' },
    ];

    const result = planImportOrder(collections, relations);

    expect(result.order).toEqual(['A', 'B']);
    expect(result.deferredFields).toEqual({});
  });

  it('self-ref: defers the self-referencing field, collection still in order once', () => {
    const collections = ['C'];
    const relations: Relation[] = [
      { collection: 'C', field: 'parent', relatedCollection: 'C' },
    ];

    const result = planImportOrder(collections, relations);

    expect(result.order).toEqual(['C']);
    expect(result.deferredFields).toEqual({ C: ['parent'] });
  });

  it('2-cycle: both collections present in order, exactly one edge deferred', () => {
    const collections = ['D', 'E'];
    const relations: Relation[] = [
      { collection: 'D', field: 'e', relatedCollection: 'E' },
      { collection: 'E', field: 'd', relatedCollection: 'D' },
    ];

    const result = planImportOrder(collections, relations);

    expect(result.order).toHaveLength(2);
    expect(result.order).toContain('D');
    expect(result.order).toContain('E');

    // Exactly one edge should be deferred
    const deferredEntries = Object.entries(result.deferredFields);
    expect(deferredEntries).toHaveLength(1);

    const [[deferredCollection, deferredFieldList]] = deferredEntries;
    expect(['D', 'E']).toContain(deferredCollection);
    expect(deferredFieldList).toHaveLength(1);
    expect(['e', 'd']).toContain(deferredFieldList[0]);
  });

  it('relation whose relatedCollection is not in collections is ignored for ordering but collection still appears', () => {
    const collections = ['F'];
    const relations: Relation[] = [
      { collection: 'F', field: 'x', relatedCollection: 'SYSTEM_TABLE' },
    ];

    const result = planImportOrder(collections, relations);

    expect(result.order).toEqual(['F']);
    expect(result.deferredFields).toEqual({});
  });

  it('every input collection appears exactly once in order', () => {
    const collections = ['A', 'B', 'C'];
    const relations: Relation[] = [
      { collection: 'B', field: 'a', relatedCollection: 'A' },
      { collection: 'C', field: 'b', relatedCollection: 'B' },
    ];

    const result = planImportOrder(collections, relations);

    expect(result.order).toHaveLength(3);
    expect(new Set(result.order).size).toBe(3);
    // A before B, B before C
    expect(result.order.indexOf('A')).toBeLessThan(result.order.indexOf('B'));
    expect(result.order.indexOf('B')).toBeLessThan(result.order.indexOf('C'));
  });
});
