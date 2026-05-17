// CyberJumping fitness trampoline — hexagonal parametric model
// Build per-part:   openscad -D part=\"frame\" -o frame.stl trampoline.scad

$fn = 6;          // 6-sided extrusion → hexagonal frame ring + mat
spring_fn = 14;

// --- Parameters (cm) ---
outer_d        = 110;
frame_thick    = 5;
mat_d          = 88;
mat_thick      = 1.6;
spring_d       = 1.6;
spring_coils   = 5;
leg_count      = 6;
leg_height     = 22;
leg_thick      = 3.5;
leg_foot_d     = 7;
leg_splay      = 22;

// Hexagonal geometry: face-midpoint radius = vertex_radius × cos(30°)
hex_c          = cos(30);
hex_face_out   = outer_d/2 * hex_c;   // outer frame face midpoint r ≈ 47.6
hex_face_mat   = mat_d/2   * hex_c;   // mat face midpoint r ≈ 38.1

// Springs span from just outside the mat face to the outer frame face centre.
// At ±10° from each face midpoint the hexagonal boundary is hex_face_out/cos(10°)
// ≈ 48.3 cm, so spring_end ≈ 47.6 stays safely inside at all 12 spring positions.
spring_start   = hex_face_mat + 0.8;
spring_len     = hex_face_out - spring_start;   // ≈ 8.7 cm

// Legs attach at hexagonal vertices (full outer_d/2 radius).
leg_top_r      = outer_d/2;
leg_floor_r    = leg_top_r + leg_height * tan(leg_splay);

// override via CLI:  -D part='"frame"' / '"mat"' / '"springs"' / '"legs"'
part = "all";

// --- Primitives ---
module ring_tube(diameter, tube_d, fn = $fn) {
    rotate_extrude(convexity = 4, $fn = fn)
        translate([diameter/2, 0, 0])
            circle(d = tube_d, $fn = max(8, fn/2));
}

module spring_one(length, d, coils) {
    coil_step = length / coils;
    for (i = [0 : coils - 1])
        translate([0, 0, i * coil_step + coil_step/2])
            rotate([90, 0, 0])
                ring_tube(diameter = d * 1.6, tube_d = d * 0.35, fn = spring_fn);
    translate([0, 0, 0])      sphere(d = d * 1.1, $fn = spring_fn);
    translate([0, 0, length]) sphere(d = d * 1.1, $fn = spring_fn);
}

// Smooth legs: hull spheres use $fn=16 so they stay round regardless of global $fn=6.
module leg_one() {
    hull() {
        translate([leg_top_r, 0, 0])
            sphere(d = leg_thick, $fn = 16);
        translate([leg_floor_r, 0, -leg_height])
            sphere(d = leg_foot_d * 0.6, $fn = 16);
    }
    translate([leg_floor_r, 0, -leg_height])
        cylinder(d = leg_foot_d, h = 0.9, center = false, $fn = 16);
}

// --- Assemblies ---
module frame_outer_part() {
    ring_tube(diameter = outer_d, tube_d = frame_thick);
}

module frame_inner_part() {
    translate([0, 0, -frame_thick * 0.15])
        ring_tube(diameter = mat_d + 4, tube_d = frame_thick * 0.5);
}

module frame_part() { frame_outer_part(); frame_inner_part(); }

module mat_part() {
    translate([0, 0, -mat_thick / 2])
        cylinder(d = mat_d, h = mat_thick, center = false);
}

// 12 springs: 2 per hexagonal face (±10° from each face midpoint).
// Face midpoints are at 30°, 90°, 150°, 210°, 270°, 330°.
// At ±10° the springs still clear the hexagonal boundary.
module springs_part() {
    spring_fan = 10;
    for (face = [0 : 5]) {
        center_a = face * 60 + 30;
        for (side = [-1, 1]) {
            rotate([0, 0, center_a + side * spring_fan])
                translate([spring_start, 0, 0])
                    rotate([0, 90, 0])
                        spring_one(length = spring_len, d = spring_d, coils = spring_coils);
        }
    }
}

// 6 legs at hexagonal vertices — split so tube and rubber foot can have different colours.
module legs_tube_part() {
    for (i = [0 : leg_count - 1]) {
        rotate([0, 0, i * 60])
            hull() {
                translate([leg_top_r, 0, 0])           sphere(d = leg_thick,         $fn = 16);
                translate([leg_floor_r, 0, -leg_height]) sphere(d = leg_foot_d * 0.6, $fn = 16);
            }
    }
}

module legs_feet_part() {
    for (i = [0 : leg_count - 1]) {
        rotate([0, 0, i * 60])
            translate([leg_floor_r, 0, -leg_height])
                cylinder(d = leg_foot_d, h = 0.9, center = false, $fn = 16);
    }
}

module legs_part() { legs_tube_part(); legs_feet_part(); }

// --- Dispatcher ---
if (part == "all") {
    frame_outer_part(); frame_inner_part();
    mat_part(); springs_part();
    legs_tube_part(); legs_feet_part();
} else if (part == "frame_outer") frame_outer_part();
  else if (part == "frame_inner") frame_inner_part();
  else if (part == "frame")       frame_part();
  else if (part == "mat")         mat_part();
  else if (part == "springs")     springs_part();
  else if (part == "legs_tube")   legs_tube_part();
  else if (part == "legs_feet")   legs_feet_part();
  else if (part == "legs")        legs_part();
