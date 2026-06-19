// 实体 ID 管理
// 每个实体（敌人、塔、投射物、特效）在创建时分配唯一递增 ID，
// 用于运行时索引、投射物目标引用等。新对局开始时需调用 resetEntityId 重置。

let _nextId = 1;

/** 返回递增的实体 ID */
export function nextEntityId(): number {
  return _nextId++;
}

/** 重置 ID 计数器为 1（新对局开始时调用） */
export function resetEntityId(): void {
  _nextId = 1;
}
