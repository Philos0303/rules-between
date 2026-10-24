param(
  [string]$GeometryPath = (Join-Path $PSScriptRoot '..\design\scene\geometry.json')
)

$ErrorActionPreference = 'Stop'
$data = Get-Content -Raw -LiteralPath $GeometryPath -Encoding UTF8 | ConvertFrom-Json
$errors = [System.Collections.Generic.List[string]]::new()
$rooms = @{}
foreach ($room in $data.rooms) { $rooms[$room.id] = $room }

function Test-PointOnEdge {
  param($Point, $Polygon, [string]$Axis)
  for ($i = 0; $i -lt $Polygon.Count; $i++) {
    $a = $Polygon[$i]; $b = $Polygon[($i + 1) % $Polygon.Count]
    if ($Axis -eq 'X' -and [math]::Abs($a[1] - $b[1]) -lt 0.0001 -and [math]::Abs($Point[1] - $a[1]) -lt 0.0001 -and $Point[0] -ge ([math]::Min($a[0], $b[0]) - 0.0001) -and $Point[0] -le ([math]::Max($a[0], $b[0]) + 0.0001)) { return $true }
    if ($Axis -eq 'Y' -and [math]::Abs($a[0] - $b[0]) -lt 0.0001 -and [math]::Abs($Point[0] - $a[0]) -lt 0.0001 -and $Point[1] -ge ([math]::Min($a[1], $b[1]) - 0.0001) -and $Point[1] -le ([math]::Max($a[1], $b[1]) + 0.0001)) { return $true }
  }
  return $false
}

function Get-OuterDirection {
  param($Room, $Point, [string]$Axis)
  $xs = @($Room.polygon | ForEach-Object { [double]$_[0] }); $ys = @($Room.polygon | ForEach-Object { [double]$_[1] })
  $cx = ($xs | Measure-Object -Average).Average; $cy = ($ys | Measure-Object -Average).Average
  if ($Axis -eq 'X') { return @(0.0, $(if ($Point[1] -gt $cy) { 1.0 } else { -1.0 })) }
  return @($(if ($Point[0] -gt $cx) { 1.0 } else { -1.0 }), 0.0)
}

function Test-PointInPolygon {
  param([double]$X, [double]$Y, $Polygon)
  $inside = $false
  for ($i = 0; $i -lt $Polygon.Count; $i++) {
    $a = $Polygon[$i]; $b = $Polygon[($i + 1) % $Polygon.Count]
    if ((($a[1] -gt $Y) -ne ($b[1] -gt $Y)) -and ($X -lt (($b[0] - $a[0]) * ($Y - $a[1]) / ($b[1] - $a[1]) + $a[0]))) { $inside = -not $inside }
  }
  return $inside
}

function Test-PointInOrOnPolygon {
  param([double]$X, [double]$Y, $Polygon)
  if (Test-PointInPolygon $X $Y $Polygon) { return $true }
  for ($i = 0; $i -lt $Polygon.Count; $i++) {
    $a = $Polygon[$i]; $b = $Polygon[($i + 1) % $Polygon.Count]
    $cross = (($X - $a[0]) * ($b[1] - $a[1])) - (($Y - $a[1]) * ($b[0] - $a[0]))
    if ([math]::Abs($cross) -lt 0.0001 -and $X -ge ([math]::Min($a[0],$b[0]) - 0.0001) -and $X -le ([math]::Max($a[0],$b[0]) + 0.0001) -and $Y -ge ([math]::Min($a[1],$b[1]) - 0.0001) -and $Y -le ([math]::Max($a[1],$b[1]) + 0.0001)) { return $true }
  }
  return $false
}

function Test-PointStrictInterior {
  param([double]$X, [double]$Y, $Polygon)
  for ($i = 0; $i -lt $Polygon.Count; $i++) {
    $a = $Polygon[$i]; $b = $Polygon[($i + 1) % $Polygon.Count]
    $cross = (($X - $a[0]) * ($b[1] - $a[1])) - (($Y - $a[1]) * ($b[0] - $a[0]))
    if ([math]::Abs($cross) -lt 0.0001 -and $X -ge ([math]::Min($a[0],$b[0]) - 0.0001) -and $X -le ([math]::Max($a[0],$b[0]) + 0.0001) -and $Y -ge ([math]::Min($a[1],$b[1]) - 0.0001) -and $Y -le ([math]::Max($a[1],$b[1]) + 0.0001)) { return $false }
  }
  return (Test-PointInPolygon $X $Y $Polygon)
}

function Test-PositivePolygonOverlap {
  param($A, $B)
  foreach ($point in $A) { if (Test-PointStrictInterior ([double]$point[0]) ([double]$point[1]) $B) { return $true } }
  foreach ($point in $B) { if (Test-PointStrictInterior ([double]$point[0]) ([double]$point[1]) $A) { return $true } }
  for ($i = 0; $i -lt $A.Count; $i++) {
    $a1=$A[$i]; $a2=$A[($i+1)%$A.Count]
    for ($j = 0; $j -lt $B.Count; $j++) {
      $b1=$B[$j]; $b2=$B[($j+1)%$B.Count]
      $d1=(($a2[0]-$a1[0])*($b1[1]-$a1[1]))-(($a2[1]-$a1[1])*($b1[0]-$a1[0]))
      $d2=(($a2[0]-$a1[0])*($b2[1]-$a1[1]))-(($a2[1]-$a1[1])*($b2[0]-$a1[0]))
      $d3=(($b2[0]-$b1[0])*($a1[1]-$b1[1]))-(($b2[1]-$b1[1])*($a1[0]-$b1[0]))
      $d4=(($b2[0]-$b1[0])*($a2[1]-$b1[1]))-(($b2[1]-$b1[1])*($a2[0]-$b1[0]))
      if (($d1*$d2 -lt -0.000001) -and ($d3*$d4 -lt -0.000001)) { return $true }
    }
  }
  return $false
}

function Test-SightRay {
  param($Room, $Window, $Target)
  $dir = Get-OuterDirection $Room $Window.center $Window.axis
  for ($d = 0.05; $d -le 30.0; $d += 0.05) {
    $x = [double]$Window.center[0] + $dir[0] * $d
    $y = [double]$Window.center[1] + $dir[1] * $d
    if (Test-PointInPolygon $x $y $Target.polygon) { return $true }
  }
  return $false
}

# Required inventory and door-centerline validation.
if ($rooms.Count -ne 25) { $errors.Add("Expected 25 rooms/nodes, found $($rooms.Count)") }
if ($data.openings.Count -ne 28) { $errors.Add("Expected 28 normal openings, found $($data.openings.Count)") }
foreach ($opening in $data.openings) {
  if ($opening.id -eq 'D20') { continue }
  foreach ($id in @($opening.a, $opening.b)) {
    if ($rooms.ContainsKey($id) -and -not (Test-PointOnEdge $opening.center $rooms[$id].polygon $opening.axis)) {
      $errors.Add("$($opening.id): center is not on $id shared wall-centerline")
    }
  }
}

# Same-level room shells may touch on a shared wall, but may not have positive-area overlap.
$inside = @($data.rooms | Where-Object { $_.floor -eq 0 -or $_.floor -eq 1 })
for ($i=0; $i -lt $inside.Count; $i++) { for ($j=$i+1; $j -lt $inside.Count; $j++) {
  if ($inside[$i].floor -eq $inside[$j].floor -and (Test-PositivePolygonOverlap $inside[$i].polygon $inside[$j].polygon)) { $errors.Add("Positive same-floor overlap: $($inside[$i].id)/$($inside[$j].id)") }
} }

# Window exterior-edge, door-clearance, sill/center and authored view-ray validation.
foreach ($window in $data.windows) {
  if (-not $rooms.ContainsKey($window.room)) { $errors.Add("$($window.id): missing room $($window.room)"); continue }
  $room = $rooms[$window.room]
  if (-not (Test-PointOnEdge $window.center $room.polygon $window.axis)) { $errors.Add("$($window.id): not on owning room wall-centerline") }
  $expectedZ = [double]$room.z + [double]$window.sill + ([double]$window.height / 2.0)
  if ([math]::Abs([double]$window.center[2] - $expectedZ) -gt 0.001) { $errors.Add("$($window.id): center.z does not equal room.z+sill+height/2") }
  foreach ($other in $data.rooms) {
    if ($other.id -ne $room.id -and $other.floor -eq $room.floor -and (Test-PointOnEdge $window.center $other.polygon $window.axis)) { $errors.Add("$($window.id): lies on shared wall with $($other.id), not an exterior wall") }
  }
  foreach ($door in $data.openings | Where-Object { $_.a -eq $room.id -or $_.b -eq $room.id }) {
    if ($door.axis -eq $window.axis -and [math]::Abs([double]$door.center[0] - [double]$window.center[0]) -lt 0.001 -and [math]::Abs([double]$door.center[1] - [double]$window.center[1]) -lt 0.001) { $errors.Add("$($window.id): shares a door centre with $($door.id)") }
  }
  if (-not $rooms.ContainsKey($window.view_to)) { $errors.Add("$($window.id): unknown view target $($window.view_to)") }
  elseif (-not (Test-SightRay $room $window $rooms[$window.view_to])) { $errors.Add("$($window.id): perpendicular exterior sight ray never reaches $($window.view_to)") }
  if ($window.kind -eq 'open_balcony_aperture' -and ($null -eq $window.railing -or [double]$window.railing.height -lt 1.10)) { $errors.Add("$($window.id): open balcony aperture lacks 1.10m railing") }
}

# Stair arithmetic and the planned slab hole / history wall must fit inside S.
$stair = $data.stair
if ([math]::Abs(([double]$stair.riser_count * [double]$stair.riser_height) - [double]$stair.floor_to_floor_rise) -gt 0.001) { $errors.Add('Stair riser count does not reach floor-to-floor rise') }
if ([math]::Abs(([double]$stair.going_count_per_flight * [double]$stair.going_depth) - [double]$stair.flight_run) -gt 0.001) { $errors.Add('Stair going count does not reach stated flight run') }
foreach ($part in @($stair.lower_flight, $stair.upper_flight, $stair.turning_landing)) {
  foreach ($point in $part.polygon) { if (-not (Test-PointInOrOnPolygon ([double]$point[0]) ([double]$point[1]) $rooms['S'].polygon)) { $errors.Add('Stair component point lies outside S') } }
}
foreach ($point in $stair.upper_landing.polygon) { if (-not (Test-PointInOrOnPolygon ([double]$point[0]) ([double]$point[1]) $rooms['U1'].polygon)) { $errors.Add('Upper stair landing lies outside U1') } }
foreach ($pair in @(@($stair.lower_flight,$stair.upper_flight), @($stair.lower_flight,$stair.turning_landing), @($stair.upper_flight,$stair.turning_landing), @($stair.upper_flight,$stair.upper_landing))) {
  if (Test-PositivePolygonOverlap $pair[0].polygon $pair[1].polygon) { $errors.Add('Stair flights/landings have positive XY overlap') }
}
foreach ($part in @($stair.lower_flight, $stair.upper_flight, $stair.turning_landing)) {
  foreach ($point in $part.polygon) { if (-not (Test-PointInOrOnPolygon ([double]$point[0]) ([double]$point[1]) $stair.upper_floor_slab_opening)) { $errors.Add('Stair route is not fully inside the upper-floor slab opening') } }
}
if ([double]$stair.minimum_clear_headroom -lt 2.10) { $errors.Add('Stair design headroom is below 2.10m') }
$d20 = $data.openings | Where-Object { $_.id -eq 'D20' }
if (-not (Test-PointInOrOnPolygon ([double]$d20.center[0]) ([double]$d20.center[1]) $stair.upper_landing.polygon)) { $errors.Add('D20 is not on the upper landing') }
function Get-PointToRectDistance {
  param([double]$X, [double]$Y, $Polygon)
  $xs = @($Polygon | ForEach-Object { [double]$_[0] }); $ys = @($Polygon | ForEach-Object { [double]$_[1] })
  $dx = [math]::Max([math]::Max(([double]($xs | Measure-Object -Minimum).Minimum - $X), 0.0), ($X - [double]($xs | Measure-Object -Maximum).Maximum))
  $dy = [math]::Max([math]::Max(([double]($ys | Measure-Object -Minimum).Minimum - $Y), 0.0), ($Y - [double]($ys | Measure-Object -Maximum).Maximum))
  return [math]::Sqrt($dx*$dx + $dy*$dy)
}
$u1Doors = @($data.openings | Where-Object { ($_.a -eq 'U1' -or $_.b -eq 'U1') -and $_.id -ne 'D20' })
foreach ($door in $u1Doors) {
  $distance = Get-PointToRectDistance ([double]$door.center[0]) ([double]$door.center[1]) $stair.upper_floor_slab_opening
  $declared = @($stair.u1_door_access | Where-Object { $_.door -eq $door.id })
  if ($distance -lt ([double]$stair.u1_player_radius - 0.0001) -and $declared.Count -eq 0) { $errors.Add("$($door.id) is too close to the stair hole without a declared access pad") }
  foreach ($access in $declared) {
    if (-not (Test-PointInOrOnPolygon ([double]$door.center[0]) ([double]$door.center[1]) $access.solid_pad_polygon)) { $errors.Add("$($door.id) is not reached by its solid access pad") }
    $padXs = @($access.solid_pad_polygon | ForEach-Object { [double]$_[0] })
    $doorLeft = [double]$door.center[0] - ([double]$door.width / 2.0); $doorRight = [double]$door.center[0] + ([double]$door.width / 2.0)
    if ($doorLeft -lt (($padXs | Measure-Object -Minimum).Minimum - 0.0001) -or $doorRight -gt (($padXs | Measure-Object -Maximum).Maximum + 0.0001)) { $errors.Add("$($door.id) clear width does not fit its solid access pad") }
    if ([double]$access.minimum_clear_width -lt [double]$door.width) { $errors.Add("$($door.id) access width is narrower than its door") }
    if ($distance -lt ([double]$access.door_center_setback_from_slab_hole - 0.0001)) { $errors.Add("$($door.id) center setback from slab hole is below its declared access setback") }
    foreach ($point in $access.navmesh_exclusion) { if (-not (Test-PointInOrOnPolygon ([double]$point[0]) ([double]$point[1]) $rooms['U1'].polygon)) { $errors.Add("$($door.id) navmesh exclusion lies outside U1") } }
  }
}
if ([double]$stair.history_wall_field.clear_height -lt 2.05) { $errors.Add('History wall has less than 2.05m clear height') }

# The high-risk support issue is checked geometrically: U6 is fully carried by S/F5/F6 at a 0.10m sampling grid.
$u6 = $rooms['U6']; $supportRooms = @($rooms['S'], $rooms['F5'], $rooms['F6'])
for ($x = -3.95; $x -lt 0.40; $x += 0.10) { for ($y = 3.65; $y -lt 6.40; $y += 0.10) {
  $supported = $false; foreach ($support in $supportRooms) { if (Test-PointInPolygon $x $y $support.polygon) { $supported = $true; break } }
  if (-not $supported) { $errors.Add("U6 unsupported at $x,$y"); break }
} if ($errors | Where-Object { $_ -like 'U6 unsupported*' }) { break } }

if ($errors.Count -gt 0) { $errors; exit 1 }
"GEOMETRY_AUDIT_OK rooms=$($rooms.Count) openings=$($data.openings.Count) windows=$($data.windows.Count) stairRise=$($stair.floor_to_floor_rise)m stairHeadroom=$($stair.minimum_clear_headroom)m U1Doors=$($u1Doors.Count) U1AccessPads=$($stair.u1_door_access.Count) U6Support=grid-verified"
