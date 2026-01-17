//! Transpiler for converting old sketch syntax to new sketch block syntax.

use crate::{
    Program,
    errors::{KclError, KclErrorDetails},
    execution::{
        ExecOutcome, KclValue,
        geometry::{Sketch, SketchSurface},
    },
    frontend::{
        api::{Expr, Number},
        ast_name_expr, ast_sketch2_name, create_coincident_ast, create_equal_length_ast, create_horizontal_ast,
        create_member_expression, create_vertical_ast,
        sketch::Point2d,
        to_ast_point2d,
    },
    parsing::ast::types as ast,
};

/// Constraint types that can be applied to segments
#[derive(Debug, Clone)]
enum SegmentConstraint {
    Horizontal,
    Vertical,
    EqualLength { other_segment_index: usize },
}

/// Transpile an old-style sketch to new sketch block syntax.
///
/// This function takes a variable name that should contain a Sketch value in
/// the ExecOutcome's variables, and generates new sketch block code.
///
/// # Arguments
/// * `exec_outcome` - The execution outcome containing the executed sketch
/// * `program` - The parsed AST program
/// * `variable_name` - The name of the variable containing the sketch
///
/// # Returns
/// The transpiled code as a string, or an error if the sketch cannot be found
/// or transpiled.
pub fn transpile_old_sketch_to_new(
    exec_outcome: &ExecOutcome,
    program: &Program,
    variable_name: &str,
) -> Result<String, KclError> {
    // Get the sketch from execution outcome
    let sketch = get_sketch_from_exec_outcome(exec_outcome, variable_name)?;

    // Get the plane name
    let plane_name = get_plane_name(&sketch)?;

    // Build the sketch block AST
    let sketch_block = build_sketch_block_ast(&sketch, &plane_name, program, variable_name)?;

    // Convert AST to string
    let output = sketch_block.recast_top(&Default::default(), 0);
    Ok(output)
}

/// Build the AST for a sketch block from the executed sketch
fn build_sketch_block_ast(
    sketch: &Sketch,
    plane_name: &str,
    program: &Program,
    variable_name: &str,
) -> Result<ast::Node<ast::Program>, KclError> {
    // Find the pipe expression with startProfile
    let pipe_expr = find_start_profile_pipe(program, variable_name)?;

    // Map segments to their AST calls using source ranges
    let segment_ast_calls = map_segments_to_ast_calls(sketch, &pipe_expr)?;

    // Detect constraints from AST
    let constraints = detect_constraints_from_ast(&segment_ast_calls, sketch)?;

    // Create the plane expression
    let plane_expr = ast::Expr::Name(Box::new(ast::Node::no_src(ast::Name {
        name: ast::Node::no_src(ast::Identifier {
            name: plane_name.to_string(),
            digest: None,
        }),
        path: Vec::new(),
        abs_path: false,
        digest: None,
    })));

    // Build sketch block body items
    let mut body_items = Vec::new();
    let mut line_names = Vec::new();

    // Start from the start point
    let mut current_x = sketch.start.from[0];
    let mut current_y = sketch.start.from[1];

    // Process each path segment
    for (i, path_segment) in sketch.paths.iter().enumerate() {
        let line_num = i + 1;
        let line_name = format!("line{}", line_num);
        line_names.push(line_name.clone());

        // Get the base path
        let base = path_segment.get_base();

        // Get start and end coordinates
        let start_x = current_x;
        let start_y = current_y;
        let end_x = base.to[0];
        let end_y = base.to[1];

        // Update current position for next segment
        current_x = end_x;
        current_y = end_y;

        // Create the line AST node using the same pattern as frontend::add_line
        let line_ast = create_line_ast(start_x, start_y, end_x, end_y, sketch.units)?;

        // Create variable declaration for the line
        let line_var_decl = ast::BodyItem::VariableDeclaration(Box::new(ast::Node::no_src(ast::VariableDeclaration {
            kind: ast::VariableKind::Const,
            declaration: ast::Node::no_src(ast::VariableDeclarator {
                id: ast::Node::no_src(ast::Identifier {
                    name: line_name.clone(),
                    digest: None,
                }),
                init: line_ast,
                digest: None,
            }),
            visibility: ast::ItemVisibility::Default,
            digest: None,
        })));

        body_items.push(line_var_decl);

        // Add coincident constraint between this line and the previous one
        if line_num > 1 {
            let prev_line_name = &line_names[line_num - 2];
            let coincident_ast = create_coincident_ast_from_names(prev_line_name, &line_name);
            body_items.push(ast::BodyItem::ExpressionStatement(ast::Node::no_src(
                ast::ExpressionStatement {
                    expression: coincident_ast,
                    digest: None,
                },
            )));
        }
    }

    // Add constraints from AST detection
    for (i, line_name) in line_names.iter().enumerate() {
        if let Some(segment_constraints) = constraints.get(i) {
            for constraint in segment_constraints {
                match constraint {
                    SegmentConstraint::Horizontal => {
                        let horizontal_ast = create_horizontal_ast_from_name(line_name);
                        body_items.push(ast::BodyItem::ExpressionStatement(ast::Node::no_src(
                            ast::ExpressionStatement {
                                expression: horizontal_ast,
                                digest: None,
                            },
                        )));
                    }
                    SegmentConstraint::Vertical => {
                        let vertical_ast = create_vertical_ast_from_name(line_name);
                        body_items.push(ast::BodyItem::ExpressionStatement(ast::Node::no_src(
                            ast::ExpressionStatement {
                                expression: vertical_ast,
                                digest: None,
                            },
                        )));
                    }
                    SegmentConstraint::EqualLength { other_segment_index } => {
                        let other_line_name = &line_names[*other_segment_index];
                        let equal_length_ast = create_equal_length_ast_from_names(line_name, other_line_name);
                        body_items.push(ast::BodyItem::ExpressionStatement(ast::Node::no_src(
                            ast::ExpressionStatement {
                                expression: equal_length_ast,
                                digest: None,
                            },
                        )));
                    }
                }
            }
        }
    }

    // Create the sketch block body (Block)
    let block = ast::Block {
        items: body_items,
        non_code_meta: Default::default(),
        inner_attrs: Default::default(),
        digest: None,
    };

    // Create the sketch block
    let sketch_block = ast::SketchBlock {
        arguments: vec![ast::LabeledArg {
            label: Some(ast::Identifier::new("on")),
            arg: plane_expr,
        }],
        body: ast::Node::no_src(block),
        is_being_edited: false,
        non_code_meta: Default::default(),
        digest: None,
    };

    // Create a program with just the sketch block
    let program = ast::Program {
        body: vec![ast::BodyItem::ExpressionStatement(ast::Node::no_src(
            ast::ExpressionStatement {
                expression: ast::Expr::SketchBlock(Box::new(ast::Node::no_src(sketch_block))),
                digest: None,
            },
        ))],
        shebang: None,
        non_code_meta: Default::default(),
        inner_attrs: Default::default(),
        digest: None,
    };

    Ok(ast::Node::no_src(program))
}

/// Convert UnitLength to NumericSuffix
fn unit_length_to_numeric_suffix(
    units: kittycad_modeling_cmds::units::UnitLength,
) -> crate::parsing::token::NumericSuffix {
    match units {
        kittycad_modeling_cmds::units::UnitLength::Millimeters => crate::parsing::token::NumericSuffix::Mm,
        kittycad_modeling_cmds::units::UnitLength::Centimeters => crate::parsing::token::NumericSuffix::Cm,
        kittycad_modeling_cmds::units::UnitLength::Meters => crate::parsing::token::NumericSuffix::M,
        kittycad_modeling_cmds::units::UnitLength::Inches => crate::parsing::token::NumericSuffix::Inch,
        kittycad_modeling_cmds::units::UnitLength::Feet => crate::parsing::token::NumericSuffix::Ft,
        kittycad_modeling_cmds::units::UnitLength::Yards => crate::parsing::token::NumericSuffix::Yd,
    }
}

/// Convert f64 + UnitLength to Number (rounding to 2 decimal places)
fn f64_to_number(value: f64, units: kittycad_modeling_cmds::units::UnitLength) -> Number {
    // Round to 2 decimal places
    let rounded = (value * 100.0).round() / 100.0;
    Number {
        value: rounded,
        units: unit_length_to_numeric_suffix(units).into(),
    }
}

/// Create an AST node for a line call (sketch2::line)
fn create_line_ast(
    start_x: f64,
    start_y: f64,
    end_x: f64,
    end_y: f64,
    units: kittycad_modeling_cmds::units::UnitLength,
) -> Result<ast::Expr, KclError> {
    // Create Point2d<Expr> with var expressions for start and end points
    let start_point = Point2d {
        x: Expr::Var(f64_to_number(start_x, units)),
        y: Expr::Var(f64_to_number(start_y, units)),
    };

    let end_point = Point2d {
        x: Expr::Var(f64_to_number(end_x, units)),
        y: Expr::Var(f64_to_number(end_y, units)),
    };

    // Convert to AST using the same function as frontend
    let start_ast = to_ast_point2d(&start_point).map_err(|e| {
        KclError::new_internal(KclErrorDetails::new(
            format!("Failed to convert start point to AST: {}", e),
            vec![],
        ))
    })?;

    let end_ast = to_ast_point2d(&end_point).map_err(|e| {
        KclError::new_internal(KclErrorDetails::new(
            format!("Failed to convert end point to AST: {}", e),
            vec![],
        ))
    })?;

    // Create the line call: sketch2::line(start = [...], end = [...])
    let line_ast = ast::Expr::CallExpressionKw(Box::new(ast::Node::no_src(ast::CallExpressionKw {
        callee: ast::Node::no_src(ast_sketch2_name("line")),
        unlabeled: None,
        arguments: vec![
            ast::LabeledArg {
                label: Some(ast::Identifier::new("start")),
                arg: start_ast,
            },
            ast::LabeledArg {
                label: Some(ast::Identifier::new("end")),
                arg: end_ast,
            },
        ],
        digest: None,
        non_code_meta: Default::default(),
    })));

    Ok(line_ast)
}

/// Create an AST node for sketch2::coincident([line1.end, line2.start])
/// Uses shared helpers from frontend.rs
fn create_coincident_ast_from_names(line1_name: &str, line2_name: &str) -> ast::Expr {
    // Create line name expressions
    let line1_expr = ast_name_expr(line1_name.to_string());
    let line2_expr = ast_name_expr(line2_name.to_string());

    // Create member expressions for line1.end and line2.start
    let line1_end = create_member_expression(line1_expr, "end");
    let line2_start = create_member_expression(line2_expr, "start");

    // Use shared helper to create coincident constraint AST
    create_coincident_ast(line1_end, line2_start)
}

/// Create an AST node for sketch2::horizontal(line)
/// Uses shared helper from frontend.rs
fn create_horizontal_ast_from_name(line_name: &str) -> ast::Expr {
    let line_expr = ast_name_expr(line_name.to_string());
    create_horizontal_ast(line_expr)
}

/// Create an AST node for sketch2::vertical(line)
/// Uses shared helper from frontend.rs
fn create_vertical_ast_from_name(line_name: &str) -> ast::Expr {
    let line_expr = ast_name_expr(line_name.to_string());
    create_vertical_ast(line_expr)
}

/// Create an AST node for sketch2::equalLength([line1, line2])
/// Uses the shared helper from frontend.rs
fn create_equal_length_ast_from_names(line1_name: &str, line2_name: &str) -> ast::Expr {
    // Create line name expressions using the same helper as frontend
    let line1_expr = ast_name_expr(line1_name.to_string());
    let line2_expr = ast_name_expr(line2_name.to_string());

    // Use the shared helper to create the equal length constraint AST
    create_equal_length_ast(line1_expr, line2_expr)
}

/// Get the plane name from a sketch
fn get_plane_name(sketch: &Sketch) -> Result<String, KclError> {
    match &sketch.on {
        SketchSurface::Plane(plane) => {
            let name = match plane.kind {
                crate::execution::geometry::PlaneKind::XY => "XY",
                crate::execution::geometry::PlaneKind::XZ => "XZ",
                crate::execution::geometry::PlaneKind::YZ => "YZ",
                crate::execution::geometry::PlaneKind::Custom => {
                    return Err(KclError::new_internal(KclErrorDetails::new(
                        "Cannot transpile sketch on custom plane".to_string(),
                        vec![],
                    )));
                }
            };
            Ok(name.to_string())
        }
        SketchSurface::Face(_) => Err(KclError::new_internal(KclErrorDetails::new(
            "Cannot transpile sketch on face".to_string(),
            vec![],
        ))),
    }
}

/// Get a Sketch value from ExecOutcome's variables.
fn get_sketch_from_exec_outcome(exec_outcome: &ExecOutcome, variable_name: &str) -> Result<Sketch, KclError> {
    let value = exec_outcome.variables.get(variable_name).ok_or_else(|| {
        KclError::new_internal(KclErrorDetails::new(
            format!("Variable '{}' not found in execution outcome", variable_name),
            vec![],
        ))
    })?;

    match value {
        KclValue::Sketch { value } => Ok(*value.clone()),
        _ => Err(KclError::new_internal(KclErrorDetails::new(
            format!("Variable '{}' is not a Sketch", variable_name),
            vec![],
        ))),
    }
}

/// Find the pipe expression containing startProfile for the given variable
fn find_start_profile_pipe<'a>(program: &'a Program, variable_name: &str) -> Result<&'a ast::PipeExpression, KclError> {
    // Find the variable declaration
    for item in &program.ast.body {
        if let ast::BodyItem::VariableDeclaration(var_decl) = item {
            if var_decl.declaration.id.name == variable_name {
                // Check if init is a PipeExpression
                if let ast::Expr::PipeExpression(pipe) = &var_decl.declaration.init {
                    // Check if it contains startProfile
                    for call in &pipe.inner.body {
                        if let ast::Expr::CallExpressionKw(call_kw) = call {
                            if call_kw.callee.name.name == "startProfile" {
                                return Ok(&pipe.inner);
                            }
                        }
                    }
                }
            }
        }
    }

    Err(KclError::new_internal(KclErrorDetails::new(
        format!("Could not find startProfile pipe for variable '{}'", variable_name),
        vec![],
    )))
}

/// Map segments to their AST calls using source ranges
/// Returns a vector of (segment_index, AST call expression)
fn map_segments_to_ast_calls<'a>(
    sketch: &Sketch,
    pipe_expr: &'a ast::PipeExpression,
) -> Result<Vec<(usize, &'a ast::CallExpressionKw)>, KclError> {
    let mut result = Vec::new();

    // Get source ranges from segments (skip startProfile, start from first segment)
    // The pipe body should have: [startProfile, line1, line2, ...]
    // So segments start at index 1 in the pipe body (skip startProfile)
    let pipe_segment_calls: Vec<&ast::CallExpressionKw> = pipe_expr
        .body
        .iter()
        .skip(1) // Skip startProfile
        .filter_map(|expr| {
            if let ast::Expr::CallExpressionKw(call) = expr {
                Some(&call.inner)
            } else {
                None
            }
        })
        .collect();

    // Match segments to pipe calls by index (they should be in the same order)
    // Only match if we have the same number of segments and calls
    for i in 0..sketch.paths.len().min(pipe_segment_calls.len()) {
        if let Some(call) = pipe_segment_calls.get(i) {
            result.push((i, *call));
        }
    }

    Ok(result)
}

/// Detect constraints from AST calls
fn detect_constraints_from_ast(
    segment_ast_calls: &[(usize, &ast::CallExpressionKw)],
    sketch: &Sketch,
) -> Result<Vec<Vec<SegmentConstraint>>, KclError> {
    let mut constraints: Vec<Vec<SegmentConstraint>> = vec![Vec::new(); sketch.paths.len()];

    for (segment_index, call) in segment_ast_calls {
        // Check if it's xLine or yLine
        // call is &CallExpressionKw, callee is Node<Name>, name is Node<Identifier>
        let function_name = &call.callee.name.name;

        if function_name == "xLine" {
            constraints[*segment_index].push(SegmentConstraint::Horizontal);
        } else if function_name == "yLine" {
            constraints[*segment_index].push(SegmentConstraint::Vertical);
        } else if function_name == "angledLine" {
            // Check for segLen() in the length argument
            for arg in &call.arguments {
                if let Some(label) = &arg.label {
                    if label.name == "length" {
                        // Check if the arg contains segLen()
                        if let Some(seg_index) = find_seg_len_reference(&arg.arg, segment_ast_calls, sketch)? {
                            constraints[*segment_index].push(SegmentConstraint::EqualLength {
                                other_segment_index: seg_index,
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(constraints)
}

/// Find segLen() reference in an expression and return the segment index it refers to
fn find_seg_len_reference(
    expr: &ast::Expr,
    _segment_ast_calls: &[(usize, &ast::CallExpressionKw)],
    sketch: &Sketch,
) -> Result<Option<usize>, KclError> {
    match expr {
        ast::Expr::CallExpressionKw(call) => {
            // Check if it's segLen()
            if call.callee.name.name == "segLen" {
                // Get the argument (should be a tag name like "seg01")
                // segLen takes the tag name as an unlabeled argument (Name expression)
                let tag_name_opt = if let Some(unlabeled) = &call.unlabeled {
                    // Check if unlabeled is a Name (tag reference like "seg01")
                    if let ast::Expr::Name(name) = unlabeled {
                        Some(name.name.name.as_str())
                    } else if let ast::Expr::TagDeclarator(tag) = unlabeled {
                        // Also support TagDeclarator for completeness
                        Some(tag.inner.name.as_str())
                    } else {
                        None
                    }
                } else {
                    // Check labeled arguments for a tag
                    call.arguments.iter().find_map(|arg| {
                        if let Some(label) = &arg.label {
                            if label.name == "tag" || label.name == "segment" {
                                if let ast::Expr::Name(name) = &arg.arg {
                                    Some(name.name.name.as_str())
                                } else if let ast::Expr::TagDeclarator(tag) = &arg.arg {
                                    Some(tag.inner.name.as_str())
                                } else {
                                    None
                                }
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    })
                };

                if let Some(tag_name) = tag_name_opt {
                    // Find the segment with this tag
                    // Tag format in AST is usually "seg01" (without $)
                    // Tag format in sketch is usually "$seg01" (with $)
                    for (i, path_segment) in sketch.paths.iter().enumerate() {
                        let base = path_segment.get_base();
                        if let Some(segment_tag) = &base.tag {
                            // Compare tag names - remove $ prefix if present
                            let segment_tag_name = segment_tag
                                .inner
                                .name
                                .strip_prefix('$')
                                .unwrap_or(&segment_tag.inner.name);
                            if segment_tag_name == tag_name {
                                return Ok(Some(i));
                            }
                        }
                    }
                }
            }
        }
        _ => {}
    }

    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        Program,
        test_server::{execute_and_snapshot_ast, new_context},
    };

    #[tokio::test]
    async fn test_transpile_simple_sketch() {
        // This test will fail until the transpiler is implemented
        // It executes the old sketch syntax and then tries to transpile it

        let code = r#"
sketch001 = startSketchOn(XY)
profile001 = startProfile(sketch001, at = [-3.71, 5.81])
  |> line(end = [-3.8, -4.92])
  |> line(end = [3.47, -5.75])
  |> xLine(length = 7.68)
  |> yLine(length = 6.29)
"#;

        // Parse the code
        let program = Program::parse_no_errs(code).unwrap();

        // Execute it using the test server
        let _ctx = new_context(true, None).await.unwrap();
        let (exec_state, ctx, env_ref, _img, _step) =
            execute_and_snapshot_ast(program.clone(), None, false).await.unwrap();

        // Convert to ExecOutcome
        let exec_outcome = exec_state.into_exec_outcome(env_ref, &ctx).await;

        // Expected transpiled output
        // Note: Coordinates are from actual execution, may have small rounding differences
        let expected_output = r#"sketch(on = XY) {
  line1 = sketch2::line(start = [var -3.71mm, var 5.81mm], end = [var -7.51mm, var 0.89mm])
  line2 = sketch2::line(start = [var -7.51mm, var 0.89mm], end = [var -4.04mm, var -4.86mm])
  sketch2::coincident([line1.end, line2.start])
  line3 = sketch2::line(start = [var -4.04mm, var -4.86mm], end = [var 3.64mm, var -4.86mm])
  sketch2::coincident([line2.end, line3.start])
  line4 = sketch2::line(start = [var 3.64mm, var -4.86mm], end = [var 3.64mm, var 1.43mm])
  sketch2::coincident([line3.end, line4.start])
  sketch2::horizontal(line3)
  sketch2::vertical(line4)
}"#;

        // Try to transpile - this should succeed and match the expected output
        let transpiled =
            transpile_old_sketch_to_new(&exec_outcome, &program, "profile001").expect("Transpiler should succeed");

        // Normalize whitespace for comparison (trim and normalize line endings)
        let normalized_transpiled = transpiled.trim().replace("\r\n", "\n");
        let normalized_expected = expected_output.trim().replace("\r\n", "\n");

        assert_eq!(
            normalized_transpiled, normalized_expected,
            "Transpiled output does not match expected output\n\nGot:\n{}\n\nExpected:\n{}",
            normalized_transpiled, normalized_expected
        );

        // Clean up
        ctx.close().await;
    }

    #[tokio::test]
    async fn can_convert_equal_length_constraints() {
        let code = r#"
sketch001 = startSketchOn(YZ)
profile001 = startProfile(sketch001, at = [2.25, 4.48])
  |> line(end = [-7.46, -1.59], tag = $seg01)
  |> yLine(length = -7.46)
  |> angledLine(angle = 15deg, length = segLen(seg01))
"#;

        // Parse the code
        let program = Program::parse_no_errs(code).unwrap();

        // Execute it using the test server
        let _ctx = new_context(true, None).await.unwrap();
        let (exec_state, ctx, env_ref, _img, _step) =
            execute_and_snapshot_ast(program.clone(), None, false).await.unwrap();

        // Convert to ExecOutcome
        let exec_outcome = exec_state.into_exec_outcome(env_ref, &ctx).await;

        // Expected transpiled output
        // Note: Coordinates are from actual execution, may have small rounding differences
        // Also note: yLine should be vertical on line2, and equalLength should be on line3
        let expected_output = r#"sketch(on = YZ) {
  line1 = sketch2::line(start = [var 2.25mm, var 4.48mm], end = [var -5.21mm, var 2.89mm])
  line2 = sketch2::line(start = [var -5.21mm, var 2.89mm], end = [var -5.21mm, var -4.57mm])
  sketch2::coincident([line1.end, line2.start])
  line3 = sketch2::line(start = [var -5.21mm, var -4.57mm], end = [var 2.16mm, var -2.6mm])
  sketch2::coincident([line2.end, line3.start])
  sketch2::vertical(line2)
  sketch2::equalLength([line3, line1])
}"#;

        // Try to transpile - this should succeed and match the expected output
        let transpiled =
            transpile_old_sketch_to_new(&exec_outcome, &program, "profile001").expect("Transpiler should succeed");

        // Normalize whitespace for comparison (trim and normalize line endings)
        let normalized_transpiled = transpiled.trim().replace("\r\n", "\n");
        let normalized_expected = expected_output.trim().replace("\r\n", "\n");

        assert_eq!(
            normalized_transpiled, normalized_expected,
            "Transpiled output does not match expected output\n\nGot:\n{}\n\nExpected:\n{}",
            normalized_transpiled, normalized_expected
        );

        // Clean up
        ctx.close().await;
    }
}
