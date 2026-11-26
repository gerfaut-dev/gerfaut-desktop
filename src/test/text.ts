/** A text matcher for a line read as a whole, however its words are
    split between elements: a line that announces its state and not its
    date holds them in two. It finds the innermost element whose whole
    text is `text`, so a line is found once, not with every element
    around it. */
export function line(text: string | RegExp) {
  const holds = (element: Element) => {
    const content = element.textContent ?? "";
    return typeof text === "string" ? content === text : text.test(content);
  };
  return (_content: string, element: Element | null) =>
    element !== null && holds(element) && ![...element.children].some(holds);
}
