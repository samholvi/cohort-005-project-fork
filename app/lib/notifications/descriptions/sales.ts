import { z } from "zod";
import { defineKind, type KindDescribers } from "./define";

// New sale, Seat claimed (Instructor), Seat claimed (Team Admin) (#28).
// Teams have no name, so a Team Licence is named by its Team Admin (the
// buyer): "Alex bought 10 Seats", "through Alex's Team Licence".

/** `seats` is null for an Individual Purchase, the Seat count for a Team Licence. */
export const newSaleData = z.object({
  buyerName: z.string(),
  courseTitle: z.string(),
  seats: z.number().int().positive().nullable(),
});

export type NewSaleData = z.infer<typeof newSaleData>;

export const seatClaimedInstructorData = z.object({
  studentName: z.string(),
  courseTitle: z.string(),
  courseId: z.number().int(),
  teamAdminName: z.string(),
});

export type SeatClaimedInstructorData = z.infer<
  typeof seatClaimedInstructorData
>;

export const seatClaimedTeamAdminData = z.object({
  studentName: z.string(),
  courseTitle: z.string(),
  seatsLeft: z.number().int().nonnegative(),
  seats: z.number().int().positive(),
});

export type SeatClaimedTeamAdminData = z.infer<typeof seatClaimedTeamAdminData>;

function seatCount(seats: number): string {
  return seats === 1 ? "1 Seat" : `${seats} Seats`;
}

export const salesDescribers: KindDescribers = {
  "new-sale": defineKind(newSaleData, (data) => ({
    text:
      data.seats === null
        ? `${data.buyerName} bought ${data.courseTitle}`
        : `${data.buyerName} bought ${seatCount(data.seats)} on ${data.courseTitle}`,
    href: "/instructor/analytics",
  })),
  "seat-claimed-instructor": defineKind(seatClaimedInstructorData, (data) => ({
    text: `${data.studentName} joined ${data.courseTitle} through ${data.teamAdminName}'s Team Licence`,
    href: `/instructor/${data.courseId}/students`,
  })),
  "seat-claimed-team-admin": defineKind(seatClaimedTeamAdminData, (data) => ({
    text:
      data.seatsLeft === 0
        ? `${data.studentName} claimed the last Seat on ${data.courseTitle}`
        : `${data.studentName} claimed a Seat on ${data.courseTitle}: ${data.seatsLeft} of ${data.seats} left`,
    href: "/team",
  })),
};
