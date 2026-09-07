// Records belong to the journal. AI supplies visual elements, not record identity/count.
export function designRecords(input, output) {
  const suggestions = Array.isArray(output.days) && output.days.length === input.days.length ? output.days : [];
  return input.days.map((day, index) => ({
    title: day.title || (typeof suggestions[index]?.title === 'string' ? suggestions[index].title.slice(0, 30) : '') || '今日小记',
    text: day.text ?? day.raw,
    assetIds: Array.isArray(suggestions[index]?.assetIds) ? suggestions[index].assetIds : [],
  }));
}
