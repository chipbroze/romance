// FIX: lib.es2015.iterable.d.ts's Array.from overloads don't accept
// `mapfn: undefined`, even though the native implementation handles it.

interface ArrayConstructor {
  from <T, U=T> (
    iterable: Iterable<T>,
    mapfn: ((v: T, k: number) => U) | undefined,
    thisArg?: any
  ): U[];
}
