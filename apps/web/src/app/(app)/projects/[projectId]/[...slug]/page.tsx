import { notFound } from 'next/navigation';

/** Unknown URLs inside the signed-in area render the 404 page within the app shell. */
export default function CatchAll() {
  notFound();
}
