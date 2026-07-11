// 自動連続生成(仕様書5.1)の定数
// 「次の会話を生成」を連続実行する回数に上限を設け、APIコストの暴走を防ぐ。
export const AUTO_GENERATE_COUNT_OPTIONS = [2, 3, 5, 10] as const;
export const AUTO_GENERATE_DEFAULT_COUNT = 3;
export const AUTO_GENERATE_MAX_COUNT = 10;
