export {}

declare global {
  interface HTMLElement {
    /**
     * The internal navigation bridge creates known button elements through a
     * generic HTMLElement helper before assigning their HTML button type.
     */
    type: string
  }
}
