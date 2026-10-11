import { currentUser, unauthorized } from "../../_lib/user";
import { sql } from "../../_lib/db";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/;

/** Save a profile image, or clear it to return to the initials avatar. */
export async function PUT(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return unauthorized();

    let body: { image?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ detail: "Send valid JSON." }, { status: 400 });
    }

    if (body.image !== null && typeof body.image !== "string") {
      return Response.json({ detail: "Choose an image or reset to the default avatar." }, { status: 400 });
    }

    let image: string | null = null;
    if (typeof body.image === "string") {
      const match = IMAGE_DATA_URL.exec(body.image);
      if (!match) {
        return Response.json({ detail: "Use a PNG or JPEG image." }, { status: 400 });
      }
      const bytes = Buffer.from(match[2], "base64");
      if (bytes.length > MAX_IMAGE_BYTES) {
        return Response.json({ detail: "Images must be 2 MB or smaller." }, { status: 413 });
      }
      const signatureMatches = match[1] === "image/png"
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : match[1] === "image/jpeg"
          ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
          : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if (!signatureMatches) {
        return Response.json({ detail: "That file does not match its image type." }, { status: 400 });
      }
      image = body.image;
    }

    const [updated] = await sql`
      UPDATE users SET avatar_data = ${image} WHERE id = ${user.id}
      RETURNING id, name, email, avatar_data`;
    return Response.json({ user: updated });
  } catch (error) {
    console.error("Failed to update profile avatar:", error);
    return Response.json(
      { detail: "Couldn't update your profile picture. Check the server logs and confirm the database schema is up to date." },
      { status: 500 },
    );
  }
}
