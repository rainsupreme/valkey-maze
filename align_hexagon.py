import re
import math

def parse_path(path_d):
    """Parse path into commands with coordinates"""
    commands = []
    pattern = r'([MLCZ])\s*([^MLCZ]*)'
    for match in re.finditer(pattern, path_d):
        cmd = match.group(1)
        coords_str = match.group(2).strip()
        if coords_str:
            nums = re.findall(r'[-+]?\d*\.?\d+', coords_str)
            coords = [(float(nums[i]), float(nums[i+1])) for i in range(0, len(nums)-1, 2)]
            commands.append((cmd, coords))
        else:
            commands.append((cmd, []))
    return commands

def find_center(coords):
    """Calculate centroid"""
    x = sum(c[0] for c in coords) / len(coords)
    y = sum(c[1] for c in coords) / len(coords)
    return x, y

def to_polar(x, y, cx, cy):
    """Convert to polar coordinates"""
    dx, dy = x - cx, y - cy
    r = math.sqrt(dx*dx + dy*dy)
    theta = math.atan2(dy, dx)
    return r, theta

def to_cartesian(r, theta, cx, cy):
    """Convert to cartesian coordinates"""
    return cx + r * math.cos(theta), cy + r * math.sin(theta)

def snap_angle(theta):
    """Snap angle to nearest 30° (hexagonal symmetry)"""
    deg = math.degrees(theta)
    snapped = round(deg / 30) * 30
    return math.radians(snapped)

def is_hex_angle(theta, tolerance=5):
    """Check if angle is close to a hexagonal angle"""
    deg = math.degrees(theta) % 360
    nearest = round(deg / 30) * 30
    return abs(deg - nearest) < tolerance

def cluster_distances(distances, tolerance=2.0):
    """Group similar distances"""
    sorted_d = sorted(distances)
    clusters = []
    current = [sorted_d[0]]
    
    for d in sorted_d[1:]:
        if d - current[-1] <= tolerance:
            current.append(d)
        else:
            clusters.append(current)
            current = [d]
    clusters.append(current)
    return clusters

def align_hexagon(input_svg, output_svg):
    """Align SVG hexagon to proper angles and distances"""
    with open(input_svg, 'r') as f:
        content = f.read()
    
    # Get canvas center from viewBox
    viewbox_match = re.search(r'viewBox="([^"]+)"', content)
    if viewbox_match:
        vb = [float(x) for x in viewbox_match.group(1).split()]
        cx, cy = vb[0] + vb[2] / 2, vb[1] + vb[3] / 2
    else:
        cx, cy = 32, 36.5
    
    path_match = re.search(r'<path[^>]*\sd="([^"]+)"', content)
    if not path_match:
        return
    
    path_d = path_match.group(1)
    commands = parse_path(path_d)
    
    # Extract all coords
    all_coords = []
    for cmd, coords in commands:
        all_coords.extend(coords)
    
    # Find center circle threshold (smallest cluster)
    distances = [to_polar(x, y, cx, cy)[0] for x, y in all_coords]
    clusters = cluster_distances(distances)
    cluster_means = [sum(c) / len(c) for c in clusters]
    center_threshold = cluster_means[0] * 1.5
    
    def nearest_cluster(r):
        return min(cluster_means, key=lambda m: abs(m - r))
    
    def align_point(x, y, prev_x=None, prev_y=None):
        r, theta = to_polar(x, y, cx, cy)
        if r < center_threshold:
            # Make circular elements perfectly centered
            new_r = nearest_cluster(r)
            return to_cartesian(new_r, theta, cx, cy)
        
        new_r = nearest_cluster(r)
        
        # Check if point is on hexagonal angle
        if is_hex_angle(theta):
            new_theta = snap_angle(theta)
            return to_cartesian(new_r, new_theta, cx, cy)
        
        # Not on hex angle - align line segment direction instead
        if prev_x is not None and prev_y is not None:
            dx, dy = x - prev_x, y - prev_y
            seg_angle = math.atan2(dy, dx)
            if is_hex_angle(seg_angle):
                new_seg_angle = snap_angle(seg_angle)
                seg_length = math.sqrt(dx*dx + dy*dy)
                return prev_x + seg_length * math.cos(new_seg_angle), prev_y + seg_length * math.sin(new_seg_angle)
        
        # Keep original angle, just normalize radius
        return to_cartesian(new_r, theta, cx, cy)
    
    # Rebuild path preserving structure
    new_path = ""
    prev_point = None
    for cmd, coords in commands:
        new_path += cmd + " "
        if cmd == 'C':
            # Align curve endpoint and recalculate control points for circular arc
            if len(coords) == 3 and prev_point:  # Cubic bezier: cp1, cp2, endpoint
                endpoint = coords[2]
                px, py = prev_point
                aligned_end = align_point(endpoint[0], endpoint[1], px, py)
                
                r_start, theta_start = to_polar(px, py, cx, cy)
                r_end, theta_end = to_polar(aligned_end[0], aligned_end[1], cx, cy)
                
                # If both points are at similar radius (circular arc)
                if abs(r_start - r_end) < 2:
                    radius = (r_start + r_end) / 2
                    angle_span = theta_end - theta_start
                    
                    # Normalize angle span to [-pi, pi]
                    while angle_span > math.pi:
                        angle_span -= 2 * math.pi
                    while angle_span < -math.pi:
                        angle_span += 2 * math.pi
                    
                    # Control point distance for circular arc
                    k = 4/3 * math.tan(angle_span / 4)
                    
                    # Calculate control points
                    cp1_theta = theta_start
                    cp1_r = radius
                    cp1_x = cx + cp1_r * math.cos(cp1_theta) - k * cp1_r * math.sin(cp1_theta)
                    cp1_y = cy + cp1_r * math.sin(cp1_theta) + k * cp1_r * math.cos(cp1_theta)
                    
                    cp2_theta = theta_end
                    cp2_r = radius
                    cp2_x = cx + cp2_r * math.cos(cp2_theta) + k * cp2_r * math.sin(cp2_theta)
                    cp2_y = cy + cp2_r * math.sin(cp2_theta) - k * cp2_r * math.cos(cp2_theta)
                    
                    new_path += f"{cp1_x} {cp1_y} {cp2_x} {cp2_y} "
                else:
                    # Not circular, keep original control points
                    new_path += f"{coords[0][0]} {coords[0][1]} {coords[1][0]} {coords[1][1]} "
                
                new_path += f"{aligned_end[0]} {aligned_end[1]} "
                prev_point = aligned_end
            else:
                for x, y in coords:
                    new_path += f"{x} {y} "
                if coords:
                    prev_point = coords[-1]
        else:
            aligned_coords = []
            for x, y in coords:
                px, py = prev_point if prev_point else (None, None)
                aligned = align_point(x, y, px, py)
                aligned_coords.append(aligned)
                prev_point = aligned
            for x, y in aligned_coords:
                new_path += f"{x} {y} "
    
    new_content = re.sub(r'<path([^>]*)\sd="[^"]+"', f'<path\\1 d="{new_path.strip()}"', content)
    with open(output_svg, 'w') as f:
        f.write(new_content)
    
    print(f"Aligned SVG written to {output_svg}")
    print(f"Center: ({cx:.2f}, {cy:.2f})")
    print(f"Distance clusters: {[f'{m:.2f}' for m in cluster_means]}")
    print(f"Center circle threshold: {center_threshold:.2f}")

if __name__ == "__main__":
    align_hexagon("Valkey-logo.svg", "Valkey-logo-aligned.svg")
