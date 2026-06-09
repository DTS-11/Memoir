declare module "density-clustering" {
  export class DBSCAN {
    run(
      dataset: number[][],
      epsilon: number,
      minPts: number,
      distanceFn?: (a: number[], b: number[]) => number,
    ): number[][];
    noise: number[];
  }
}
