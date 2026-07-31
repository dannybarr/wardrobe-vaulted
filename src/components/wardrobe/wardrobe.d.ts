// The wardrobe UI is carried over from the original app as plain JSX to keep its
// behaviour and visuals identical. These declarations describe its public shape.
declare module "@/components/wardrobe/App.jsx" {
  export function WardrobeApp(): JSX.Element;
  export function App(): JSX.Element;
}

declare module "./App.jsx" {
  export function WardrobeApp(): JSX.Element;
  export function App(): JSX.Element;
}

declare module "./import-flow.jsx" {
  export function WardrobeImportFlow(props: Record<string, unknown>): JSX.Element;
}

declare module "./wishlist.jsx" {
  export function WishlistPane(props: Record<string, unknown>): JSX.Element;
}

declare module "./outfits.jsx" {
  export function OutfitsPane(props: Record<string, unknown>): JSX.Element;
}

declare module "./add-piece.jsx" {
  export function AddPieceModal(props: Record<string, unknown>): JSX.Element;
}

declare module "./OptimizedImage.jsx" {
  export function OptimizedImage(props: Record<string, unknown>): JSX.Element;
}
