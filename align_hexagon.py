"""Align the Valkey logo SVG to proper hexagonal geometry.

The Valkey logo is a spiral shape with three concentric hexagonal rings
(outer, middle, inner) connected by vertical steps that form a gap.
The center contains a circular cutout with a filled circle inside it.

This script snaps hex vertices to mathematically perfect positions,
computes step points as vertical lines intersecting hex edges, and
rebuilds the circular arcs with proper cubic bezier approximations.
"""

import math
import re
import sys

# -------------------------------------------------------------------
# Geometry helpers
# -------------------------------------------------------------------


def hex_vertex(cx: float, cy: float, r: float, angle_deg: float) -> tuple[float, float]:
    """Return (x, y) of a regular hexagon vertex at the given angle."""
    t = math.radians(angle_deg)
    return cx + r * math.cos(t), cy + r * math.sin(t)


def y_on_hex_edge(cx: float, cy: float, r: float, a1: float, a2: float, x: float) -> float | None:
    """Find y where a vertical line at x intersects the hex edge from a1 to a2.

    Returns None if x is outside the edge's x-range.
    """
    x1, y1 = hex_vertex(cx, cy, r, a1)
    x2, y2 = hex_vertex(cx, cy, r, a2)
    dx = x2 - x1
    if abs(dx) < 1e-9:
        return None
    t = (x - x1) / dx
    if t < -0.01 or t > 1.01:
        return None
    return y1 + t * (y2 - y1)


def cubic_bezier_arc(
    cx: float, cy: float, r: float, a1_deg: float, a2_deg: float
) -> tuple[tuple[float, float], tuple[float, float], tuple[float, float]]:
    """Cubic bezier control points approximating a circular arc.

    Returns (cp1, cp2, endpoint) for the arc from a1 to a2.
    """
    t1 = math.radians(a1_deg)
    t2 = math.radians(a2_deg)
    span = t2 - t1
    k = 4.0 / 3.0 * math.tan(span / 4.0)

    sx, sy = cx + r * math.cos(t1), cy + r * math.sin(t1)
    ex, ey = cx + r * math.cos(t2), cy + r * math.sin(t2)

    cp1 = (sx - k * r * math.sin(t1), sy + k * r * math.cos(t1))
    cp2 = (ex + k * r * math.sin(t2), ey - k * r * math.cos(t2))
    return cp1, cp2, (ex, ey)


# -------------------------------------------------------------------
# SVG path parsing
# -------------------------------------------------------------------


def parse_svg_path(path_d: str) -> list[tuple[str, list[tuple[float, float]]]]:
    """Parse an SVG path d-attribute into a list of (command, points)."""
    tokens = path_d.split()
    commands: list[tuple[str, list[tuple[float, float]]]] = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok == "Z":
            commands.append(("Z", []))
            i += 1
        elif tok in ("M", "L"):
            commands.append((tok, [(float(tokens[i + 1]), float(tokens[i + 2]))]))
            i += 3
        elif tok == "C":
            pts = [
                (float(tokens[i + 1]), float(tokens[i + 2])),
                (float(tokens[i + 3]), float(tokens[i + 4])),
                (float(tokens[i + 5]), float(tokens[i + 6])),
            ]
            commands.append(("C", pts))
            i += 7
        else:
            i += 1
    return commands


# -------------------------------------------------------------------
# Main alignment
# -------------------------------------------------------------------


def align_hexagon(input_svg: str, output_svg: str) -> None:
    """Align the Valkey logo to proper hexagonal geometry."""
    with open(input_svg) as f:
        content = f.read()

    path_match = re.search(r'<path[^>]*\sd="([^"]+)"', content)
    if not path_match:
        print("No path found in SVG")
        return

    commands = parse_svg_path(path_match.group(1))

    # Split at Z commands to find subpaths
    z_idx = [i for i, (cmd, _) in enumerate(commands) if cmd == "Z"]

    # -----------------------------------------------------------
    # Find true center from the inner filled circle (2nd subpath)
    # The circle has M + 4 curves. Use opposite endpoints.
    # -----------------------------------------------------------
    circle2_start = z_idx[0] + 1
    circle2_m = commands[circle2_start][1][0]  # M point (top)
    circle2_curves = [commands[i] for i in range(circle2_start + 1, len(commands)) if commands[i][0] == "C"]
    # Endpoints: right, bottom, left, top (back to start)
    right_pt = circle2_curves[0][1][2]
    bottom_pt = circle2_curves[1][1][2]
    left_pt = circle2_curves[2][1][2]
    # Center from opposite pairs
    cx = (right_pt[0] + left_pt[0]) / 2
    cy = (circle2_m[1] + bottom_pt[1]) / 2  # top + bottom

    inner_circle_r = (right_pt[0] - left_pt[0]) / 2

    # -----------------------------------------------------------
    # Extract main subpath L-points and compute hex radii
    # -----------------------------------------------------------
    main_pts: list[tuple[float, float]] = []
    main_curve_endpoints: list[tuple[float, float]] = []
    for i in range(0, z_idx[0]):
        cmd, pts = commands[i]
        if cmd in ("M", "L"):
            main_pts.append(pts[0])
        elif cmd == "C":
            main_curve_endpoints.append(pts[2])

    def dist(p: tuple[float, float]) -> float:
        return math.sqrt((p[0] - cx) ** 2 + (p[1] - cy) ** 2)

    # Outer hex: points 1-6 (6 vertices)
    outer_r = sum(dist(main_pts[i]) for i in range(1, 7)) / 6

    # Inner hex: points 10-14 (5 vertices, missing 90°)
    inner_r = sum(dist(main_pts[i]) for i in range(10, 15)) / 5

    # Middle hex: we need to identify them by radius range
    # Points after curves: indices 17+ in main_pts
    # Middle vertices are at indices 19-24 in the original numbering
    # but our main_pts skips curve commands, so after p16 the next
    # L-point is what was p17 (curve endpoint is separate).
    # Actually, let me re-examine. The curve endpoint (p17 in the
    # original analysis) is the last C endpoint, not an L point.
    # The L points after curves start from what I called p18.
    # So main_pts[17] = original p18, main_pts[18] = p19, etc.
    #
    # Middle hex vertices: main_pts[18..23] = original p19..p24
    mid_r = sum(dist(main_pts[i]) for i in range(18, 24)) / 6

    # Outer circle (cutout) radius from curve endpoints
    outer_circle_r = sum(dist(p) for p in main_curve_endpoints) / len(main_curve_endpoints)

    print(f"Center: ({cx:.3f}, {cy:.3f})")
    print(f"Outer hex R={outer_r:.2f}, Middle R={mid_r:.2f}, Inner R={inner_r:.2f}")
    print(f"Outer circle R={outer_circle_r:.2f}, Inner circle R={inner_circle_r:.2f}")

    # -----------------------------------------------------------
    # Compute aligned points
    # -----------------------------------------------------------
    # Hex vertex angles (pointy-top): -90, -30, 30, 90, 150, -150

    # Outer hex vertices (points 1-6)
    p = {}
    p[1] = hex_vertex(cx, cy, outer_r, 150)
    p[2] = hex_vertex(cx, cy, outer_r, -150)
    p[3] = hex_vertex(cx, cy, outer_r, -90)
    p[4] = hex_vertex(cx, cy, outer_r, -30)
    p[5] = hex_vertex(cx, cy, outer_r, 30)
    p[6] = hex_vertex(cx, cy, outer_r, 90)

    # Inner hex vertices (points 10-14)
    p[10] = hex_vertex(cx, cy, inner_r, 150)
    p[11] = hex_vertex(cx, cy, inner_r, -150)
    p[12] = hex_vertex(cx, cy, inner_r, -90)
    p[13] = hex_vertex(cx, cy, inner_r, -30)
    p[14] = hex_vertex(cx, cy, inner_r, 30)

    # Middle hex vertices (original points 19-24)
    p[19] = hex_vertex(cx, cy, mid_r, 90)
    p[20] = hex_vertex(cx, cy, mid_r, 30)
    p[21] = hex_vertex(cx, cy, mid_r, -30)
    p[22] = hex_vertex(cx, cy, mid_r, -90)
    p[23] = hex_vertex(cx, cy, mid_r, -150)
    p[24] = hex_vertex(cx, cy, mid_r, 150)

    # -----------------------------------------------------------
    # Spiral step points (vertical lines on hex edges)
    # Each step is a vertical line at a specific x, intersecting
    # two hex edges at different radii.
    # -----------------------------------------------------------

    # Step 1: outer->inner (original points 0, 7, 8, 9)
    # x from original point 7 (on outer edge 90°->150°)
    x_step1 = main_pts[7][0]
    p[7] = (x_step1, y_on_hex_edge(cx, cy, outer_r, 90, 150, x_step1))
    # Points 8 and 9 drop vertically to inner edge 90°->150°
    y_inner_at_step1 = y_on_hex_edge(cx, cy, inner_r, 90, 150, x_step1)
    # In the original, p8 and p9 are very close together (51.04 vs 49.12)
    # p9 is the actual corner, p8 is a small offset above it
    # The offset is about 1.9 units in the original
    offset_89 = main_pts[8][1] - main_pts[9][1]
    p[9] = (x_step1, y_inner_at_step1)
    p[8] = (x_step1, y_inner_at_step1 + offset_89)

    # Point 0 (and 25_end): on outer edge 90°->150°
    x_step3 = main_pts[0][0]
    p[0] = (x_step3, y_on_hex_edge(cx, cy, outer_r, 90, 150, x_step3))

    # Step 2: inner->circle (original points 15, 16)
    # x from original point 15 (on inner edge 30°->90°)
    x_step2 = main_pts[15][0]
    p[15] = (x_step2, y_on_hex_edge(cx, cy, inner_r, 30, 90, x_step2))
    # p16 drops to outer circle radius at same x
    # Actually, p16 should be at the circle at the same x
    # y = cy + sqrt(r² - (x-cx)²) for the upper half
    dx16 = x_step2 - cx
    if abs(dx16) <= outer_circle_r:
        y16 = cy + math.sqrt(outer_circle_r**2 - dx16**2)
        p[16] = (x_step2, y16)
        angle_p16 = math.degrees(math.atan2(y16 - cy, dx16))
    else:
        # Fallback
        p[16] = (x_step2, main_pts[16][1])
        angle_p16 = 70.0

    # Step 3: circle->middle (original point 17=curve end, 18)
    # p17 is the curve endpoint, symmetric to p16 across vertical axis
    # Mirror x across cx
    x_step2b = 2 * cx - x_step2
    if abs(x_step2b - cx) <= outer_circle_r:
        y17 = cy + math.sqrt(outer_circle_r**2 - (x_step2b - cx) ** 2)
        p[17] = (x_step2b, y17)
        angle_p17 = math.degrees(math.atan2(y17 - cy, x_step2b - cx))
    else:
        p[17] = (x_step2b, main_curve_endpoints[-1][1])
        angle_p17 = 110.0

    # p18: from circle up to middle edge 90°->150°
    p[18] = (x_step2b, y_on_hex_edge(cx, cy, mid_r, 90, 150, x_step2b))

    # Step 4: middle->outer (original point 25)
    # x from original point 25 (same x as point 0)
    p[25] = (x_step3, y_on_hex_edge(cx, cy, mid_r, 90, 150, x_step3))

    # -----------------------------------------------------------
    # Outer circle cutout curves (4 cubic beziers)
    # Arc from p16 (angle_p16) clockwise to p17 (angle_p17)
    # Going the long way: ~70° -> 0° -> -90° -> ±180° -> ~110°
    # -----------------------------------------------------------
    total_arc = 360.0 - (angle_p17 - angle_p16)
    seg = total_arc / 4.0
    arc_angles = [angle_p16 - i * seg for i in range(5)]

    outer_curves = []
    for i in range(4):
        cp1, cp2, end = cubic_bezier_arc(cx, cy, outer_circle_r, arc_angles[i], arc_angles[i + 1])
        outer_curves.append((cp1, cp2, end))

    # -----------------------------------------------------------
    # Inner filled circle (4 cubic beziers, 90° each)
    # Starts at top (-90°), goes clockwise: 0°, 90°, 180°, -90°
    # -----------------------------------------------------------
    inner_start = (cx, cy - inner_circle_r)  # top, angle = -90°
    inner_curves = []
    for i in range(4):
        a1 = -90 + i * 90
        a2 = -90 + (i + 1) * 90
        cp1, cp2, end = cubic_bezier_arc(cx, cy, inner_circle_r, a1, a2)
        inner_curves.append((cp1, cp2, end))

    # -----------------------------------------------------------
    # Assemble new path
    # -----------------------------------------------------------
    def f(pt: tuple[float, float]) -> str:
        return f"{pt[0]:.6f} {pt[1]:.6f}"

    parts = []
    # Main subpath
    parts.append(f"M {f(p[0])}")
    for i in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]:
        parts.append(f"L {f(p[i])}")
    for cp1, cp2, end in outer_curves:
        parts.append(f"C {f(cp1)} {f(cp2)} {f(end)}")
    for i in [18, 19, 20, 21, 22, 23, 24, 25]:
        parts.append(f"L {f(p[i])}")
    parts.append(f"L {f(p[0])}")
    parts.append("Z")

    # Inner circle subpath
    parts.append(f"M {f(inner_start)}")
    for cp1, cp2, end in inner_curves:
        parts.append(f"C {f(cp1)} {f(cp2)} {f(end)}")
    parts.append("Z")

    new_path = " ".join(parts)

    # -----------------------------------------------------------
    # Update SVG content
    # -----------------------------------------------------------
    new_content = re.sub(
        r'(<path[^>]*\sd=")[^"]+(")',
        lambda m: m.group(1) + new_path + m.group(2),
        content,
    )

    # Update viewBox to exact bounding box of outer hex (no padding)
    all_hex = [p[i] for i in [1, 2, 3, 4, 5, 6]]
    min_x = min(pt[0] for pt in all_hex)
    min_y = min(pt[1] for pt in all_hex)
    max_x = max(pt[0] for pt in all_hex)
    max_y = max(pt[1] for pt in all_hex)
    vb_w = max_x - min_x
    vb_h = max_y - min_y
    new_content = re.sub(r'viewBox="[^"]*"', f'viewBox="{min_x:.2f} {min_y:.2f} {vb_w:.2f} {vb_h:.2f}"', new_content)
    new_content = re.sub(r'width="\d+"', f'width="{vb_w:.0f}"', new_content)
    new_content = re.sub(r'height="\d+"', f'height="{vb_h:.0f}"', new_content)

    with open(output_svg, "w") as f:
        f.write(new_content)

    print(f"Written to {output_svg}")
    print(f"Hex radii: outer={outer_r:.2f}, middle={mid_r:.2f}, inner={inner_r:.2f}")
    print(f"Circle radii: cutout={outer_circle_r:.2f}, filled={inner_circle_r:.2f}")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "assets/valkey-logo.svg"
    dst = sys.argv[2] if len(sys.argv) > 2 else "assets/valkey-logo-aligned.svg"
    align_hexagon(src, dst)
