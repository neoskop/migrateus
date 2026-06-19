export interface Relation {
  collection: string;        // the collection that HAS the foreign key
  field: string;             // the FK field on `collection`
  relatedCollection: string; // the referenced collection
}

export interface ImportOrder {
  order: string[];                          // referenced collections before referencing ones
  deferredFields: Record<string, string[]>; // collection -> FK fields to null on insert, patch after
}

/**
 * Topologically sort `collections` by their `relations` so that referenced
 * collections are inserted before referencing ones.
 *
 * Back-edges (self-references and cycle edges) are detected and their fields
 * recorded in `deferredFields` so callers can NULL them on initial insert and
 * patch them in a second pass after all rows exist.
 */
export function planImportOrder(
  collections: string[],
  relations: Relation[],
): ImportOrder {
  const collectionSet = new Set(collections);
  const deferredFields: Record<string, string[]> = {};

  // Separate self-references from cross-collection relations.
  // Self-references are immediate back-edges — defer them, remove from graph.
  const activeRelations: Relation[] = [];
  for (const rel of relations) {
    // Ignore relations to collections not being imported
    if (!collectionSet.has(rel.relatedCollection)) continue;

    if (rel.collection === rel.relatedCollection) {
      // Self-reference: defer field immediately
      (deferredFields[rel.collection] ??= []).push(rel.field);
    } else {
      activeRelations.push(rel);
    }
  }

  // Build adjacency and in-degree maps for Kahn's algorithm.
  // Edge: collection depends on relatedCollection (insert relatedCollection first).
  // In Kahn's terms: there is a directed edge relatedCollection → collection.
  const inDegree: Map<string, number> = new Map(
    collections.map((c) => [c, 0]),
  );
  // predecessors[c] = list of collections that must come before c
  const successors: Map<string, string[]> = new Map(
    collections.map((c) => [c, []]),
  );

  for (const rel of activeRelations) {
    // relatedCollection → collection edge
    successors.get(rel.relatedCollection)!.push(rel.collection);
    inDegree.set(rel.collection, (inDegree.get(rel.collection) ?? 0) + 1);
  }

  const order: string[] = [];
  const queue: string[] = [];

  // Seed queue with zero-in-degree nodes
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node);
  }
  // Sort for determinism
  queue.sort();

  while (order.length < collections.length) {
    if (queue.length > 0) {
      // Normal Kahn step
      queue.sort();
      const node = queue.shift()!;
      order.push(node);

      for (const successor of successors.get(node) ?? []) {
        const newDeg = (inDegree.get(successor) ?? 1) - 1;
        inDegree.set(successor, newDeg);
        if (newDeg === 0) queue.push(successor);
      }
    } else {
      // A cycle remains — find it and break by deferring one back-edge.
      // Pick any remaining node (still has in-degree > 0) as the cycle member.
      // Use the first remaining relation in the cycle to decide which field to defer.
      const remaining = new Set<string>();
      for (const [node, deg] of inDegree) {
        if (deg > 0 && !order.includes(node)) remaining.add(node);
      }

      // Find one back-edge to defer: pick the first active relation whose both
      // endpoints are still in `remaining`.
      let broke = false;
      for (const rel of activeRelations) {
        if (remaining.has(rel.collection) && remaining.has(rel.relatedCollection)) {
          // Defer this edge
          (deferredFields[rel.collection] ??= []).push(rel.field);
          // Remove this edge from the graph
          const sucList = successors.get(rel.relatedCollection);
          if (sucList) {
            const idx = sucList.indexOf(rel.collection);
            if (idx !== -1) sucList.splice(idx, 1);
          }
          inDegree.set(rel.collection, (inDegree.get(rel.collection) ?? 1) - 1);

          // Re-seed queue from remaining with in-degree 0
          for (const node of remaining) {
            if ((inDegree.get(node) ?? 0) === 0) queue.push(node);
          }

          broke = true;
          break;
        }
      }

      if (!broke) {
        // Should not happen with a valid input, but guard against infinite loop
        break;
      }
    }
  }

  return { order, deferredFields };
}
